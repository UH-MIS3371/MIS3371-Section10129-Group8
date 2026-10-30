"use strict";

// TigerSteps | Tests for the Lambda handler (index.js).
// Run from the repository root: npm run test:lambda
// Uses the same event files you can paste into the Lambda console Test tab.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { handler } = require("../index.js");

function loadEvent(name) {
    return require(path.join(__dirname, "events", name));
}

// Runs the handler and reads the JSON text in the response body.
async function run(event) {
    const response = await handler(event);
    assert.equal(typeof response.body, "string", "API Gateway needs body as a string");
    assert.equal(response.headers["Content-Type"], "application/json");
    return { code: response.statusCode, result: JSON.parse(response.body) };
}

test("Valid: approved.json is Approved (200), nothing saved", async () => {
    const { code, result } = await run(loadEvent("approved.json"));
    assert.equal(code, 200);
    assert.equal(result.status, "Approved");
    assert.equal(result.persisted, false);
});

test("Invalid: the same event again is Rejected by BR-5 (400) while this instance is warm", async () => {
    const { code, result } = await run(loadEvent("approved.json"));
    assert.equal(code, 400);
    assert.equal(result.rule, "BR-5");
});

test("Invalid: rejected-br4.json cannot unlock a final-sale item with fake values (400)", async () => {
    const { code, result } = await run(loadEvent("rejected-br4.json"));
    assert.equal(code, 400);
    assert.equal(result.status, "Rejected");
    assert.equal(result.rule, "BR-4");
});

test("Valid: minimal-console.json (no routeKey, like the Amazon Q event) is Approved", async () => {
    const { code, result } = await run(loadEvent("minimal-console.json"));
    assert.equal(code, 200);
    assert.equal(result.status, "Approved");
});

test("Validation: blank reason is 400 with no Rejected status", async () => {
    const { code, result } = await run(loadEvent("validation-blank-reason.json"));
    assert.equal(code, 400);
    assert.equal(result.error, "Validation");
    assert.equal(result.status, undefined);
});

test("Validation: body that is not JSON, or no body, is 400", async () => {
    assert.equal((await run(loadEvent("invalid-json.json"))).code, 400);
    const noBody = { ...loadEvent("approved.json"), body: undefined };
    assert.equal((await run(noBody)).result.error, "Validation");
});

test("Valid: a base64 body is decoded the same way", async () => {
    const event = loadEvent("rejected-br4.json");
    const encoded = { ...event, body: Buffer.from(event.body).toString("base64"), isBase64Encoded: true };
    const { result } = await run(encoded);
    assert.equal(result.rule, "BR-4");
});

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

test("Logging: one line per request, with the outcome but not the customer's reason", async () => {
    const { lines } = await runAndCapture(loadEvent("rejected-br4.json"));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^\[LAMBDA\] POST \/api\/returns -> 400 Rejected BR-4 \| persisted: false$/);
    assert.equal(lines[0].includes("Does not fit"), false, "the reason text is not logged");
});

test("Server error: if the backend breaks, the browser still gets JSON (500)", async () => {
    const backend = require("../backend/backend.js");
    const original = backend.processReturnRequest;
    backend.processReturnRequest = () => { throw new Error("test failure"); };
    try {
        const { response, errors } = await runAndCapture(loadEvent("rejected-br4.json"));
        assert.equal(response.statusCode, 500);
        assert.equal(response.headers["Content-Type"], "application/json");
        const body = JSON.parse(response.body);
        assert.equal(body.error, "Server");
        assert.equal(response.body.includes("test failure"), false, "no error details sent to the browser");
        assert.equal(errors.length, 1, "details go to the log instead");
    } finally {
        backend.processReturnRequest = original;
    }
});
