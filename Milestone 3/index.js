"use strict";

// ============================================================
// TigerSteps | index.js | Week 10 AWS Lambda handler
//
// API Gateway (HTTP API, payload format 2.0) turns each HTTP request into an
// "event" and calls handler(event). This file only reads the event, calls
// backend/backend.js, and turns the result back into an HTTP response.
// It holds NO business rules, the same as server/server.js does locally.
//
// Lambda setting: Handler = index.handler (file index.js, export "handler").
// ============================================================

// Kept as one object (not destructured) so tests can swap a function to
// check what happens when the backend fails.
const backend = require("./backend/backend");

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
        return "GET /api/orders";
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

// Sends one request to the right backend function. No rules here.
function handleRoute(route, event) {
    // Submit one return request. 200 = Approved. 400 = validation error or Rejected.
    if (route === "POST /api/returns") {
        const body = readJsonBody(event);
        if (!body.ok) {
            return invalidJson();
        }

        const result = backend.processReturnRequest(body.value);
        return respond(result.success ? 200 : 400, result);
    }

    // "Find my order" (BR-2 lookup). Only the safe fields findOrderItems() chooses.
    if (route === "GET /api/orders") {
        const query = event.queryStringParameters || {};
        const items = backend.findOrderItems(query.customerId, query.orderId);
        if (items.length === 0) {
            return respond(404, { success: false, message: "No order matches that Customer ID and Order ID." });
        }
        return respond(200, { success: true, items });
    }

    return respond(405, { success: false, message: "Use GET /api/orders or POST /api/returns." });
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
        const response = handleRoute(route, event);
        logOutcome(route, response);
        return response;
    } catch (error) {
        // Something unexpected broke. The details go to CloudWatch only; the
        // browser gets a plain JSON message it can show.
        console.error("[LAMBDA] " + route + " failed:", error);
        return respond(500, { success: false, error: "Server", message: "Something went wrong. Please try again." });
    }
};
