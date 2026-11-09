"use strict";

// ============================================================
// TigerSteps | index.js | AWS Lambda handler (Week 11)
//
// API Gateway (HTTP API, payload format 2.0) turns each HTTP request into an
// "event" and calls handler(event). This file reads the event, calls
// backend/backend.js, saves approved returns in DynamoDB, and turns the
// result back into an HTTP response. It holds NO business rules: the backend
// decides every return, including BR-5.
//
// Lambda settings: Handler = index.handler. Environment variable
// TABLE_NAME = the DynamoDB table (key: returnId, String).
// ============================================================

const { randomUUID } = require("node:crypto");

// Kept as one object (not destructured) so tests can swap a function to
// check what happens when the backend fails.
const backend = require("./backend/backend");

// Official IDs for saved returns. The customer never chooses one.
const RETURN_ID_PREFIX = "RR-";

// BR-5 marker: one extra item per order item that has an approved return,
// stored in the same table under the key "ACTIVE#<customer|order|sku>".
const MARKER_PREFIX = "ACTIVE#";

// The only request fields that are saved (the data contract). Anything else
// the customer sends, such as status or finalSale, is never stored.
const CONTRACT_FIELDS = [
    "customerId", "orderId", "sku", "returnQuantity",
    "reason", "reportedCondition", "preferredRefundMethod"
];

// Read when needed, so a missing setting gives a clear 500 instead of a crash.
function tableName() {
    return process.env.TABLE_NAME;
}

// ------------------------------------------------------------
// Database (DynamoDB). The AWS SDK is part of the Lambda runtime. It is
// loaded on first use, so the order lookup and the local tests (which
// replace this object) never need it.
// ------------------------------------------------------------

let aws = null;
function dynamo() {
    if (!aws) {
        const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
        const lib = require("@aws-sdk/lib-dynamodb");
        // One client for the life of the Lambda instance. It uses the Lambda
        // role (LabRole) and the Lambda's Region.
        aws = { lib, client: lib.DynamoDBDocumentClient.from(new DynamoDBClient({})) };
    }
    return aws;
}

const database = {
    // The BR-5 marker for one order item, or null.
    async getMarker(key) {
        const { lib, client } = dynamo();
        const response = await client.send(new lib.GetCommand({
            TableName: tableName(),
            Key: { returnId: MARKER_PREFIX + key }
        }));
        return response.Item || null;
    },

    // Saves the return and its BR-5 marker together: both or neither.
    // Returns false when the marker already exists, which means another
    // request for the same item was saved a moment earlier.
    async saveApproved(record, key) {
        const { lib, client } = dynamo();
        try {
            await client.send(new lib.TransactWriteCommand({
                TransactItems: [
                    { Put: {
                        TableName: tableName(),
                        Item: record,
                        ConditionExpression: "attribute_not_exists(returnId)"
                    } },
                    { Put: {
                        TableName: tableName(),
                        Item: { returnId: MARKER_PREFIX + key, activeReturnId: record.returnId, createdAt: record.submittedAt },
                        ConditionExpression: "attribute_not_exists(returnId)"
                    } }
                ]
            }));
            return true;
        } catch (error) {
            // The reasons are listed in the same order as TransactItems: [1] is the marker.
            const reasons = error.CancellationReasons || [];
            if (error.name === "TransactionCanceledException" && reasons[1]?.Code === "ConditionalCheckFailed") {
                return false;
            }
            throw error;
        }
    },

    // One saved return by its ID, or null. GetCommand reads by key; it does not scan.
    async getReturn(returnId) {
        const { lib, client } = dynamo();
        const response = await client.send(new lib.GetCommand({
            TableName: tableName(),
            Key: { returnId }
        }));
        return response.Item || null;
    }
};

// ------------------------------------------------------------
// HTTP helpers
// ------------------------------------------------------------

// Every response is JSON. CORS headers are set in API Gateway, not here.
function respond(statusCode, body) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    };
}

// Same shape as a backend validation error, so the browser handles it the same way.
function invalidJson() {
    const message = "The request body must be valid JSON.";
    return respond(400, { success: false, error: "Validation", problems: [message], message });
}

// Unexpected failure, for example the database write. persisted: false says
// clearly that nothing was saved. The real error only goes to CloudWatch.
function serverError(message) {
    return respond(500, { success: false, error: "Server", message, persisted: false });
}

function notFound() {
    return respond(404, { success: false, message: "Return not found. Check the confirmation number." });
}

// Which route was called. A real API Gateway event has routeKey, for example
// "POST /api/returns". A short test event made in the Lambda console may only
// have the method, so fall back to that.
function routeOf(event) {
    if (event.routeKey && event.routeKey !== "$default") {
        return event.routeKey;
    }

    const method = event.requestContext?.http?.method;
    if (method === "POST") {
        return "POST /api/returns";
    }
    if (method === "GET") {
        return event.pathParameters && "returnId" in event.pathParameters
            ? "GET /api/returns/{returnId}"
            : "GET /api/orders";
    }
    return method || "UNKNOWN";
}

// event.body is JSON TEXT, not an object. API Gateway may also send it as base64.
function readJsonBody(event) {
    if (typeof event.body !== "string" || event.body.trim() === "") {
        return { ok: false };
    }

    const text = event.isBase64Encoded
        ? Buffer.from(event.body, "base64").toString("utf8")
        : event.body;

    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (error) {
        return { ok: false };
    }
}

// True when the three IDs are text, so a BR-5 marker key can be built.
function hasItemIds(request) {
    return Boolean(request) && typeof request === "object"
        && typeof request.customerId === "string"
        && typeof request.orderId === "string"
        && typeof request.sku === "string";
}

// The record stored for one approved return: the contract fields the
// customer sent (already validated by the backend) plus trusted values.
function buildRecord(request, result, key) {
    const record = { returnId: RETURN_ID_PREFIX + randomUUID() };
    for (const field of CONTRACT_FIELDS) {
        record[field] = typeof request[field] === "string" ? request[field].trim() : request[field];
    }
    record.status = result.status;
    record.statusHistory = result.statusHistory;
    record.submittedAt = result.submittedAt;
    record.decidedAt = result.decidedAt;
    record.itemKey = key;
    return record;
}

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------

// POST /api/returns: validate and decide (backend), then save if Approved.
// 200 = Approved and saved. 400 = validation error or Rejected (never saved).
async function submitReturn(event) {
    const body = readJsonBody(event);
    if (!body.ok) {
        return invalidJson();
    }
    const request = body.value;

    // BR-5 needs to know about earlier requests. The database supplies that
    // fact; the backend still makes the decision.
    const key = hasItemIds(request) ? backend.itemKey(request.customerId, request.orderId, request.sku) : null;
    const blockedKeys = new Set();
    if (key && await database.getMarker(key)) {
        blockedKeys.add(key);
    }

    let result = backend.processReturnRequest(request, undefined, blockedKeys);
    if (!result.success) {
        return respond(400, result);
    }

    const record = buildRecord(request, result, key);
    const saved = await database.saveApproved(record, key);
    if (!saved) {
        // Another request for this item was saved a moment ago. Ask the
        // backend again with the item blocked, so BR-5 gives the answer.
        result = backend.processReturnRequest(request, undefined, new Set([key]));
        return respond(400, result);
    }

    // persisted: true only after the write succeeded.
    return respond(200, {
        ...result,
        returnId: record.returnId,
        message: "Approved and saved. Your confirmation number is " + record.returnId + ".",
        persisted: true
    });
}

// GET /api/returns/{returnId}: one saved return by its confirmation number.
async function viewReturn(event) {
    const raw = event.pathParameters?.returnId;
    if (typeof raw !== "string" || raw.trim() === "") {
        return respond(400, { success: false, message: "A confirmation number is required." });
    }

    const returnId = raw.trim();
    // Only real return IDs are looked up. BR-5 marker items are never shown.
    if (!returnId.startsWith(RETURN_ID_PREFIX)) {
        return notFound();
    }

    const item = await database.getReturn(returnId);
    if (!item) {
        return notFound();
    }
    return respond(200, { success: true, returnRequest: item });
}

// "Find my order" (BR-2 lookup). Only the safe fields findOrderItems() chooses.
function lookupOrder(event) {
    const query = event.queryStringParameters || {};
    const items = backend.findOrderItems(query.customerId, query.orderId);
    if (items.length === 0) {
        return respond(404, { success: false, message: "No order matches that Customer ID and Order ID." });
    }
    return respond(200, { success: true, items });
}

// Sends one request to the right function. No rules here.
async function handleRoute(route, event) {
    if (route === "GET /api/orders") {
        return lookupOrder(event);
    }

    if (route === "POST /api/returns" || route === "GET /api/returns/{returnId}") {
        if (!tableName()) {
            return serverError("Database configuration error.");
        }
        return route === "POST /api/returns" ? submitReturn(event) : viewReturn(event);
    }

    return respond(405, { success: false, message: "Use GET /api/orders, POST /api/returns, or GET /api/returns/{returnId}." });
}

// One short line per request goes to CloudWatch Logs. It names the route and
// the outcome only. The customer's reason and contact details are never logged.
function logOutcome(route, response) {
    const body = JSON.parse(response.body);
    const outcome = body.status || body.error || (body.success ? "OK" : "Not found");
    console.log("[LAMBDA] " + route + " -> " + response.statusCode + " " + outcome
        + (body.rule ? " " + body.rule : "") + " | persisted: " + (body.persisted ?? false));
}

exports.handler = async (event = {}) => {
    const route = routeOf(event);

    try {
        const response = await handleRoute(route, event);
        logOutcome(route, response);
        return response;
    } catch (error) {
        // Something unexpected broke, for example the database. The details
        // go to CloudWatch only; the browser gets a plain JSON message.
        console.error("[LAMBDA] " + route + " failed:", error);
        return serverError("Something went wrong. Please try again.");
    }
};

// For tests: they replace these functions with an in-memory database.
exports.database = database;
