"use strict";

// ============================================================
// TigerSteps | server/server.js | Week 9 local HTTP layer
//
// This file only moves data between the browser and backend/backend.js.
// It holds NO business rules. Every return decision comes from
// processReturnRequest(). On AWS, index.js (the Lambda handler) does this
// job. This file stays for local runs and tests.
// ============================================================

const path = require("node:path");
const express = require("express");
const { processReturnRequest, findOrderItems } = require("../backend/backend");

const app = express();

// Turns a JSON request body into a JavaScript object on req.body.
// It does not check any return fields. backend.js does that.
app.use(express.json({ limit: "20kb" }));

// Serves the ONE frontend in src/. Visiting / opens the return form.
app.use(express.static(path.join(__dirname, "..", "src")));

// "Find my order" (BR-2 lookup). Sends back only the safe fields that
// findOrderItems() chooses. 404 when the customer and order do not match.
app.get("/api/orders", (req, res) => {
  const items = findOrderItems(req.query.customerId, req.query.orderId);
  if (items.length === 0) {
    return res.status(404).json({ success: false, message: "No order matches that Customer ID and Order ID." });
  }
  return res.json({ success: true, items });
});

// Submit one return request. 200 = Approved. 400 = the request reached the
// backend but was not approved: either a validation error or a Rejected
// decision. The JSON body says which one.
app.post("/api/returns", (req, res) => {
  const result = processReturnRequest(req.body);
  console.log("[SERVER] POST /api/returns:", result.status || result.error, "| persisted:", result.persisted ?? false);
  return res.status(result.success ? 200 : 400).json(result);
});

// A body that is not valid JSON never reaches the backend.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
    return res.status(400).json({ success: false, error: "Validation", problems: ["The request body must be valid JSON."], message: "The request body must be valid JSON." });
  }
  return next(err);
});

// Start listening only when run directly (npm start), not when a test loads it.
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`TigerSteps return form: http://localhost:${port}/`);
    console.log(`Return API: POST http://localhost:${port}/api/returns`);
    console.log("Local only. No database or AWS yet, so nothing is saved.");
  });
}

module.exports = app;