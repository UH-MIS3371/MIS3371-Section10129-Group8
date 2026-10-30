"use strict";

// TigerSteps | HTTP tests for the local API.
// Run from the repository root: npm run test:api
// Each test sends JSON straight to the server, the way curl would. The form is
// never opened, so these prove the backend holds the rules, not the browser.

const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("./server.js");

let server;
let baseUrl;

test.before(() => new Promise(resolve => {
  // Port 0 lets the system pick any free port.
  server = app.listen(0, () => {
    baseUrl = "http://localhost:" + server.address().port;
    resolve();
  });
}));

test.after(() => new Promise(resolve => server.close(resolve)));

// A complete request, so only the rule under test can fail.
function requestFor(customerId, orderId, sku, quantity) {
  return {
    customerId, orderId, sku,
    returnQuantity: quantity,
    reason: "Does not fit",
    reportedCondition: "unworn",
    preferredRefundMethod: "original-payment"
  };
}

async function postReturn(body) {
  const response = await fetch(baseUrl + "/api/returns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
  return { code: response.status, result: await response.json() };
}

test("Valid: lookup returns safe fields and the BR-4 preview", async () => {
  const response = await fetch(baseUrl + "/api/orders?customerId=C1004&orderId=ORD-1004");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.items.length, 2);
  for (const item of body.items) {
    assert.equal("finalSale" in item, false);
    assert.equal("clearance" in item, false);
    assert.equal(typeof item.returnable, "boolean");
  }
});

test("Invalid: lookup with a customer who does not own the order is 404", async () => {
  const response = await fetch(baseUrl + "/api/orders?customerId=C1002&orderId=ORD-1001");
  assert.equal(response.status, 404);
});

test("Valid: regular item is Approved (200), nothing saved", async () => {
  const { code, result } = await postReturn(requestFor("C1001", "ORD-1001", "TS-1001", 1));
  assert.equal(code, 200);
  assert.equal(result.status, "Approved");
  assert.equal(result.persisted, false);
  assert.deepEqual(result.statusHistory.map(step => step.status), ["Submitted", "Approved"]);
});

test("Invalid: the same item again is Rejected by BR-5 (400)", async () => {
  const { code, result } = await postReturn(requestFor("C1001", "ORD-1001", "TS-1001", 1));
  assert.equal(code, 400);
  assert.equal(result.status, "Rejected");
  assert.equal(result.rule, "BR-5");
});

test("Invalid: fake trusted values cannot unlock a final-sale item (BR-4, 400)", async () => {
  const sneaky = {
    ...requestFor("C1003", "ORD-1003", "TS-2001", 1),
    finalSale: false, clearance: false, status: "Approved", deliveryDate: "2099-01-01"
  };
  const { code, result } = await postReturn(sneaky);
  assert.equal(code, 400);
  assert.equal(result.status, "Rejected");
  assert.equal(result.rule, "BR-4");
});

test("Boundary: day 60 after delivery is Approved (200)", async () => {
  const { code, result } = await postReturn(requestFor("C1008", "ORD-1008", "TS-1003", 2));
  assert.equal(code, 200);
  assert.equal(result.status, "Approved");
});

test("Boundary: day 61 after delivery is Rejected by BR-1 (400)", async () => {
  const { code, result } = await postReturn(requestFor("C1002", "ORD-1002", "TS-1003", 1));
  assert.equal(code, 400);
  assert.equal(result.rule, "BR-1");
});

test("Validation: missing reason is 400 with no Rejected status", async () => {
  const { code, result } = await postReturn({ ...requestFor("C1004", "ORD-1004", "TS-1001", 1), reason: "" });
  assert.equal(code, 400);
  assert.equal(result.error, "Validation");
  assert.equal(result.status, undefined);
});

test("Validation: a body that is not JSON is 400", async () => {
  const { code, result } = await postReturn("{not json");
  assert.equal(code, 400);
  assert.equal(result.error, "Validation");
});
