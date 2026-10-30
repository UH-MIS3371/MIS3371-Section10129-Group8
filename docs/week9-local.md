# TigerSteps: Week 9 Local API Checkpoint

## 1. What Week 9 Adds

The existing return form now talks to the Week 8 backend over HTTP and JSON through a local Express server. The business rules did not change and did not move: `backend/backend.js` still decides every request.

The browser no longer holds any order records or rule logic. It asks the server for the customer's order, sends the return request, and shows the decision that comes back.

No AWS, no database. Nothing is saved (`persisted: false`).

## 2. Files

| Path | Role |
|---|---|
| `src/index.html` | The one return form (unchanged) |
| `src/style.css` | Stylesheet (unchanged) |
| `src/app.js` | Calls `GET /api/orders` and `POST /api/returns`, shows feedback. No rules, no order data |
| `backend/backend.js` | Week 8 rules BR-1 to BR-7, reused as is |
| `server/server.js` | Express: serves `src/`, routes HTTP to `findOrderItems()` and `processReturnRequest()`. No rules |
| `server/test-api.js` | HTTP tests that send JSON straight to the server, skipping the form |
| `package.json` | `npm start`, `npm run test:backend`, `npm run test:api` |

## 3. How to Run

From the repository root:

```bash
npm install        # once, installs Express
npm start          # starts the server
```

Open http://localhost:3000 (not `file://`). Press Control+C in the terminal to stop the server.

Try these fictional orders:

| Customer / Order / Item | What happens |
|---|---|
| C1001 / ORD-1001 / TS-1001, qty 1 | Approved. Submit again: Rejected BR-5 |
| C1003 / ORD-1003 / TS-2001 | Item shows "cannot be returned". Submit: Rejected BR-4 |
| C1008 / ORD-1008 / TS-1003 | Day 60 after delivery. Approved |
| C1002 / ORD-1002 / TS-1003 | Day 61 after delivery. Rejected BR-1 |

## 4. API

### `GET /api/orders?customerId=...&orderId=...`

Returns the items on that order with safe fields only: `sku`, `name`, `quantityPurchased`, `quantityPreviouslyReturned`, `remainingEligibleQuantity`, `deliveryDate`, `returnable`, `returnableMessage`. The raw `finalSale` and `clearance` flags never leave the server. `returnable` is a BR-4 preview for the form; the decision still happens on submit. No match gives 404.

### `POST /api/returns`

Request body (JSON): `customerId`, `orderId`, `sku`, `returnQuantity`, `reason`, `reportedCondition`, `preferredRefundMethod`. Any other field, such as `status`, `finalSale`, or `deliveryDate`, is ignored.

| HTTP status | Body | Meaning | What the form shows |
|---|---|---|---|
| 200 | `success: true, status: "Approved"` | Every rule passed | Approved message, status rail on Approved |
| 400 | `success: false, status: "Rejected", rule, reasons` | Reached the backend, a business rule failed | Rejected with every failed rule |
| 400 | `success: false, error: "Validation", problems` | Reached the backend, input missing or malformed | Field problems, status rail stays on Draft |
| none | `fetch` throws | Server not running or not reachable | "Cannot reach the TigerSteps server." |

Both 400 cases follow the Week 9 pattern `res.status(result.success ? 200 : 400)`. The JSON body tells them apart.

## 5. Bypassing the Form

The backend does not depend on the browser. This request claims a final-sale item is not final sale and is already approved. The form is never opened:

```bash
curl -i -X POST http://localhost:3000/api/returns \
  -H "Content-Type: application/json" \
  -d '{"customerId":"C1003","orderId":"ORD-1003","sku":"TS-2001","returnQuantity":1,"reason":"Does not fit","reportedCondition":"unworn","preferredRefundMethod":"store-credit","finalSale":false,"status":"Approved"}'
```

Actual response (2026-10-28):

```text
HTTP/1.1 400 Bad Request
{"success":false,"status":"Rejected","rule":"BR-4","reasons":[{"rule":"BR-4","message":"Final-sale and clearance items cannot be returned."}], ... ,"persisted":false}
```

## 6. API Test Cases

Run with `npm run test:api`. "Actual" is the real HTTP status and body from the running server.

| # | Category | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Valid | GET /api/orders?customerId=C1004&orderId=ORD-1004 | 200, 2 items, no finalSale field | 200, 2 items, no finalSale field | PASS |
| 2 | Valid | POST C1001 / ORD-1001 / TS-1001, qty 1 | 200 Approved | 200 Approved | PASS |
| 3 | Invalid | POST the same item again | 400 Rejected BR-5 | 400 Rejected BR-5 | PASS |
| 4 | Invalid | POST C1003 final-sale item with finalSale: false, status: "Approved" | 400 Rejected BR-4 | 400 Rejected BR-4 | PASS |
| 5 | Invalid | GET /api/orders?customerId=C1002&orderId=ORD-1001 | 404 | 404 | PASS |
| 6 | Boundary | POST C1008 / ORD-1008 / TS-1003, qty 2, day 60 | 200 Approved | 200 Approved | PASS |
| 7 | Boundary | POST C1002 / ORD-1002 / TS-1003, qty 1, day 61 | 400 Rejected BR-1 | 400 Rejected BR-1 | PASS |
| 8 | Validation | POST complete request with blank reason | 400 Validation | 400 Validation | PASS |
| 9 | Validation | POST body "{not json" | 400 Validation | 400 Validation | PASS |

Total: 9. Passed: 9. Failed: 0. The backend unit tests are in `docs/week8-backend-testing.md`.

## 7. Checkpoint Review (4 Points)

| Item | Points | Where |
|---|---|---|
| Server and JSON | 0.75 | `server/server.js`, section 4 |
| Reuse Week 8 rules | 0.75 | Server calls `processReturnRequest()`; no rule in the server or in `src/app.js` |
| Frontend fetch | 1.00 | `handleOrderLookup()` and `handleSubmit()` in `src/app.js` |
| Feedback | 0.50 | Approved, Rejected, validation, and connection messages (section 4) |
| Testing and docs | 0.50 | Section 6 and `docs/week8-backend-testing.md` |
| Repository and contributions | 0.50 | Section 8 and commit history |

## 8. Network Evidence

Screenshots to capture in Chrome DevTools, Network tab, for this build:

- [ ] `GET /api/orders` for C1001 / ORD-1001: status 200, response with safe fields only
- [ ] `POST /api/returns` Approved: payload has the seven fields, status 200
- [ ] `POST /api/returns` Rejected (same item again, BR-5): status 400
- [ ] `POST /api/returns` with the server stopped: request failed, form shows the connection message

### Earlier build (before 2026-10-28)

These screenshots were taken from an earlier version whose response format was different. Kept for history.

<img width="2940" height="1648" alt="E606A1D1-21D7-410A-9A55-05E51B37445D" src="https://github.com/user-attachments/assets/c7f3baa9-4f71-4a37-a2ca-7455529ba75b" />

<img width="1470" height="824" alt="09597056-7B83-4ED0-A3D2-5430C8BEA444" src="https://github.com/user-attachments/assets/20409ad5-f2ac-4dec-85d4-1df61eb925b3" />

<img width="1470" height="824" alt="EE5E0292-9B98-40F3-BBD7-B283F669B014" src="https://github.com/user-attachments/assets/afb62e7b-ac12-44d5-8b08-4a63f0865c3f" />

<img width="1470" height="824" alt="C6D718CF-09B5-42E1-A185-EA615CCD7211" src="https://github.com/user-attachments/assets/05d0dae6-8f70-4222-944b-fccff679d6e5" />

## Team Contributions

Team members contributed to the development and integration of the TigerSteps application, including:

- Frontend HTML and CSS development.
- JavaScript form validation and order lookup.
- Backend business rule implementation.
- Backend testing.
- Express server and API integration.
- Frontend-to-backend connection.

Individual contributions should be documented in the team's GitHub repository and activity tracker.

## 9. Not in Week 9

- AWS Lambda and API Gateway (Week 10)
- DynamoDB and saved requests (Week 11). Until then BR-5 forgets approved items when the server restarts.
- Real refunds
