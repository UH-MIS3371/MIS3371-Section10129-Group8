"use strict";

// TigerSteps | Tests for the Lambda handler (index.js).
// Run from the Milestone 3 folder: npm run test:lambda
// Uses the same event files you can paste into the Lambda console Test tab.
// DynamoDB is replaced by a small in-memory table, so no AWS account or SDK
// is needed. The real database calls are tested in the Lambda console.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const lambda = require("../index.js");
const { handler, database } = lambda;

const TABLE = "TigerSteps-Returns-Test";
const realDatabase = { ...database };

// The in-memory table: returnId -> item. Rebuilt before every test.
let table;
let calls;

function useFakeDatabase() {
    table = new Map();
    calls = { getMarker: 0, saveApproved: 0, getReturn: 0 };
    database.getMarker = async key => { calls.getMarker += 1; return table.get("ACTIVE#" + key) || null; };
    database.saveApproved = async (record, key) => {
        calls.saveApproved += 1;
        // Same rule as the real write: both items must be new.
        if (table.has(record.returnId) || table.has("ACTIVE#" + key)) {
            return false;
        }
        table.set(record.returnId, record);
        table.set("ACTIVE#" + key, { returnId: "ACTIVE#" + key, activeReturnId: record.returnId });
        return true;
    };
    database.getReturn = async returnId => { calls.getReturn += 1; return table.get(returnId) || null; };
}

function savedReturns() {
    return [...table.values()].filter(item => item.returnId.startsWith("RR-"));
}

test.beforeEach(() => {
    process.env.TABLE_NAME = TABLE;
    useFakeDatabase();
});

test.after(() => {
    Object.assign(database, realDatabase);
});

function loadEvent(name) {
    return JSON.parse(JSON.stringify(require(path.join(__dirname, "events", name))));
}

// The approved event with some fields changed.
function approvedWith(change) {
    const event = loadEvent("approved.json");
    event.body = JSON.stringify({ ...JSON.parse(event.body), ...change });
    return event;
}

function getEvent(returnId) {
    const event = loadEvent("get-return.json");
    event.pathParameters = { returnId };
    return event;
}

// Runs the handler and reads the JSON text in the response body.
async function run(event) {
    const response = await handler(event);
    assert.equal(typeof response.body, "string", "API Gateway needs body as a string");
    assert.equal(response.headers["Content-Type"], "application/json");
    return { code: response.statusCode, result: JSON.parse(response.body) };
}

// ---------- POST: validate, decide, save ----------

test("Valid: approved.json is Approved, saved, and gets a real confirmation number (200)", async () => {
    const { code, result } = await run(loadEvent("approved.json"));
    assert.equal(code, 200);
    assert.equal(result.status, "Approved");
    assert.equal(result.persisted, true);
    assert.match(result.returnId, /^RR-[0-9a-f-]{36}$/);
    assert.ok(result.message.includes(result.returnId), "message names the confirmation number");
    assert.equal(savedReturns().length, 1);
    assert.equal(savedReturns()[0].returnId, result.returnId);
    assert.ok(table.has("ACTIVE#C1001|ORD-1001|TS-1001"), "BR-5 marker saved with it");
});

test("Trust: only contract fields and trusted values are saved", async () => {
    const { result } = await run(approvedWith({
        returnId: "RR-chosen-by-customer", status: "Rejected", finalSale: false,
        phone: "713-555-0123", deliveryDate: "2099-01-01"
    }));
    const saved = savedReturns()[0];
    assert.notEqual(saved.returnId, "RR-chosen-by-customer");
    assert.equal(saved.returnId, result.returnId);
    assert.equal(saved.status, "Approved");
    assert.deepEqual(Object.keys(saved).sort(), [
        "customerId", "decidedAt", "itemKey", "orderId", "preferredRefundMethod", "reason",
        "reportedCondition", "returnId", "returnQuantity", "sku", "status", "statusHistory", "submittedAt"
    ]);
    assert.deepEqual(saved.statusHistory.map(step => step.status), ["Submitted", "Approved"]);
});

test("Invalid: the same item again is Rejected by BR-5 (400) and nothing new is saved", async () => {
    await run(loadEvent("approved.json"));
    const { code, result } = await run(loadEvent("approved.json"));
    assert.equal(code, 400);
    assert.equal(result.rule, "BR-5");
    assert.equal(result.persisted, false);
    assert.equal(savedReturns().length, 1);
    assert.equal(calls.saveApproved, 1, "no second write was tried");
});

test("Boundary: two requests at once, the second write loses and gets BR-5 (400)", async () => {
    // The marker check passes, but the conditional write finds the marker.
    database.saveApproved = async () => false;
    const { code, result } = await run(loadEvent("approved.json"));
    assert.equal(code, 400);
    assert.equal(result.status, "Rejected");
    assert.equal(result.rule, "BR-5");
});

test("Invalid: rejected-br4.json is Rejected (400) and never saved", async () => {
    const { code, result } = await run(loadEvent("rejected-br4.json"));
    assert.equal(code, 400);
    assert.equal(result.rule, "BR-4");
    assert.equal(calls.saveApproved, 0);
    assert.equal(table.size, 0);
});

test("Validation: blank reason is 400, not Rejected, and never saved", async () => {
    const { code, result } = await run(loadEvent("validation-blank-reason.json"));
    assert.equal(code, 400);
    assert.equal(result.error, "Validation");
    assert.equal(result.status, undefined);
    assert.equal(calls.saveApproved, 0);
});

test("Valid: minimal-console.json (no routeKey, like the Amazon Q event) is saved", async () => {
    const { code, result } = await run(loadEvent("minimal-console.json"));
    assert.equal(code, 200);
    assert.equal(result.persisted, true);
});

test("Validation: body that is not JSON, or no body, is 400", async () => {
    assert.equal((await run(loadEvent("invalid-json.json"))).code, 400);
    const noBody = { ...loadEvent("approved.json"), body: undefined };
    assert.equal((await run(noBody)).result.error, "Validation");
});

test("Valid: a base64 body is decoded the same way", async () => {
    const event = loadEvent("rejected-br4.json");
    const encoded = { ...event, body: Buffer.from(event.body).toString("base64"), isBase64Encoded: true };
    assert.equal((await run(encoded)).result.rule, "BR-4");
});

// ---------- GET: retrieve by confirmation number ----------

test("Valid: GET returns the saved return by its confirmation number (200)", async () => {
    const saved = (await run(loadEvent("approved.json"))).result;
    const { code, result } = await run(getEvent(saved.returnId));
    assert.equal(code, 200);
    assert.equal(result.success, true);
    assert.equal(result.returnRequest.returnId, saved.returnId);
    assert.equal(result.returnRequest.status, "Approved");
    assert.equal(result.returnRequest.sku, "TS-1001");
});

test("Invalid: get-return-not-found.json is 404, not a made-up record", async () => {
    const { code, result } = await run(loadEvent("get-return-not-found.json"));
    assert.equal(code, 404);
    assert.equal(result.success, false);
    assert.equal(result.returnRequest, undefined);
});

test("Validation: GET with a blank confirmation number is 400", async () => {
    assert.equal((await run(getEvent("   "))).code, 400);
});

test("Trust: a BR-5 marker key cannot be read through GET (404, no database read)", async () => {
    await run(loadEvent("approved.json"));
    const { code } = await run(getEvent("ACTIVE#C1001|ORD-1001|TS-1001"));
    assert.equal(code, 404);
    assert.equal(calls.getReturn, 0);
});

test("Valid: a GET event without routeKey but with pathParameters reaches the GET route", async () => {
    const saved = (await run(loadEvent("approved.json"))).result;
    const event = { version: "2.0", requestContext: { http: { method: "GET" } }, pathParameters: { returnId: saved.returnId } };
    assert.equal((await run(event)).code, 200);
});

// ---------- Order lookup and other routes ----------

test("Valid: lookup.json returns safe fields only", async () => {
    const { code, result } = await run(loadEvent("lookup.json"));
    assert.equal(code, 200);
    assert.equal(result.items.length, 2);
    for (const item of result.items) {
        assert.equal("finalSale" in item, false);
        assert.equal("clearance" in item, false);
        assert.equal(typeof item.returnable, "boolean");
    }
});

test("Invalid: lookup for a customer who does not own the order is 404", async () => {
    const event = { ...loadEvent("lookup.json"), queryStringParameters: { customerId: "C1002", orderId: "ORD-1001" } };
    assert.equal((await run(event)).code, 404);
});

test("Invalid: any other method is 405", async () => {
    const { code } = await run({ version: "2.0", requestContext: { http: { method: "DELETE" } } });
    assert.equal(code, 405);
});

// ---------- Errors and logging ----------

// Collects what the handler prints while one event runs.
async function runAndCapture(event) {
    const lines = [];
    const errors = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args) => lines.push(args.join(" "));
    console.error = (...args) => errors.push(args.join(" "));
    try {
        return { response: await handler(event), lines, errors };
    } finally {
        console.log = originalLog;
        console.error = originalError;
    }
}

test("Server error: if DynamoDB fails, the browser gets JSON 500 with no details", async () => {
    database.getMarker = async () => { throw new Error("database down for the test"); };
    const { response, errors } = await runAndCapture(loadEvent("approved.json"));
    assert.equal(response.statusCode, 500);
    assert.equal(JSON.parse(response.body).error, "Server");
    assert.equal(response.body.includes("database down"), false);
    assert.equal(errors.length, 1, "details go to the log instead");
});

test("Server error: if the DynamoDB write fails, 500 with persisted: false and nothing saved", async () => {
    database.saveApproved = async () => { calls.saveApproved += 1; throw new Error("write failed for the test"); };
    const { response, errors } = await runAndCapture(loadEvent("approved.json"));
    const result = JSON.parse(response.body);
    assert.equal(response.statusCode, 500);
    assert.equal(result.success, false);
    assert.equal(result.persisted, false);
    assert.equal(result.returnId, undefined, "no confirmation number for a return that was not saved");
    assert.equal(response.body.includes("write failed"), false);
    assert.equal(calls.saveApproved, 1);
    assert.equal(savedReturns().length, 0);
    assert.equal(errors.length, 1);
});

test("Configuration: without TABLE_NAME the returns routes are 500, lookup still works", async () => {
    delete process.env.TABLE_NAME;
    const post = await run(loadEvent("approved.json"));
    assert.equal(post.code, 500);
    assert.equal(post.result.message, "Database configuration error.");
    assert.equal(post.result.persisted, false);
    assert.equal((await run(getEvent("RR-anything"))).code, 500);
    assert.equal((await run(loadEvent("lookup.json"))).code, 200);
    assert.equal(calls.getMarker + calls.saveApproved + calls.getReturn, 0);
});

test("Logging: one line per request, with the outcome but not the customer's reason", async () => {
    const { lines } = await runAndCapture(loadEvent("rejected-br4.json"));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[LAMBDA\] POST \/api\/returns -> 400 Rejected BR-4 \| persisted: false$/);
    assert.equal(lines[0].includes("Does not fit"), false, "the reason text is not logged");

    const saved = await runAndCapture(loadEvent("approved.json"));
    assert.match(saved.lines[0], /-> 200 Approved \| persisted: true$/);
});

test("Server error: if the backend breaks, the browser still gets JSON (500)", async () => {
    const backend = require("../backend/backend.js");
    const original = backend.processReturnRequest;
    backend.processReturnRequest = () => { throw new Error("test failure"); };
    try {
        const { response, errors } = await runAndCapture(loadEvent("rejected-br4.json"));
        assert.equal(response.statusCode, 500);
        assert.equal(response.body.includes("test failure"), false, "no error details sent to the browser");
        assert.equal(errors.length, 1);
    } finally {
        backend.processReturnRequest = original;
    }
});
