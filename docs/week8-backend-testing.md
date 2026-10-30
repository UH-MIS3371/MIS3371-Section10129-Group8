# TigerSteps: Week 8 Backend Testing

## 1. Purpose

This note records the Week 8 local backend for the TigerSteps online footwear return request system.

The backend decides every return request in plain JavaScript on Node.js. It does not trust anything the browser checked. It reads the order record itself, uses the server clock for today's date, and ignores any trusted value the customer sends (such as `finalSale` or `status`).

## 2. Business Rules Enforced by the Backend

| ID | Rule | Function in `backend/backend.js` |
|---|---|---|
| BR-1 | Return within 60 days after delivery. Day 60 is allowed, day 61 is not. | `isReturnWindowExpired()` |
| BR-2 | Customer ID, Order ID, and SKU must match one order-item record. | `findOrderItem()` |
| BR-3 | Quantity is a positive whole number within purchased minus previously returned. | `checkReturnQuantity()` |
| BR-4 | Final-sale and clearance items cannot be returned. | `isFinalSale()` |
| BR-5 | Only one active request per customer, order, and item. | `hasActiveRequest()` |
| BR-6 | All rules pass gives Approved. Any failure gives Rejected and names every failed rule. | `decideReturnRequest()` |
| BR-7 | Status goes Submitted, then Approved or Rejected. | `processReturnRequest()` builds `statusHistory` |

Missing or malformed input is a validation error (`error: "Validation"`), not a Rejected decision. Validation runs before any rule. Wrong data types are reported, never converted: `returnQuantity` must be a JSON number (`1`, not `"1"` or `true`) and text fields must be strings.

## 3. Files and Environment

- Backend logic: `backend/backend.js`
- Tests: `backend/test-backend.js` (uses `node:test`, built into Node.js, nothing to install)
- Runtime: Node.js 24
- Test data: fictional TigerSteps order records (NFR-5)
- Database, API, AWS: not used in Week 8

## 4. Test Cases and Results

Each case calls `processReturnRequest(request, today, new Set())` with a complete request, so only the rule under test can fail. "Actual" is the real output of the function.

| # | Category | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Valid | C1001 / ORD-1001 / TS-1001, qty 1, delivered 59 days ago | Approved | Approved | PASS |
| 2 | Valid | C1001 / ORD-1001 / TS-1002, qty 1 (second item on the same order) | Approved | Approved | PASS |
| 3 | Invalid | C1002 / ORD-1001 / TS-1001 (customer does not own the order) | Rejected BR-2 | Rejected BR-2 | PASS |
| 4 | Invalid | C1001 / ORD-1001 / TS-1001, qty 3 (only 2 bought) | Rejected BR-3 | Rejected BR-3 | PASS |
| 5 | Invalid | C1003 / ORD-1003 / TS-2001, final sale | Rejected BR-4 | Rejected BR-4 | PASS |
| 6 | Invalid | C1005 / ORD-1005 / TS-3001, clearance | Rejected BR-4 | Rejected BR-4 | PASS |
| 7 | Invalid | C1007 / ORD-1007 / TS-1002, request already open | Rejected BR-5 | Rejected BR-5 | PASS |
| 8 | Invalid | C1004 / ORD-1004 / TS-2002, qty 9 on a final-sale item | Rejected BR-3, BR-4 | Rejected BR-3, BR-4 | PASS |
| 9 | Invalid | C1003 / ORD-1003 / TS-2001 sent with finalSale: false, status: "Approved" | Rejected BR-4 | Rejected BR-4 | PASS |
| 10 | Boundary | C1008 / ORD-1008 / TS-1003, qty 2, day 60 after delivery, all units | Approved | Approved | PASS |
| 11 | Boundary | C1002 / ORD-1002 / TS-1003, qty 1, day 61 after delivery | Rejected BR-1 | Rejected BR-1 | PASS |
| 12 | Boundary | C1006 / ORD-1006 / TS-1001, qty 1, all units already returned | Rejected BR-3 | Rejected BR-3 | PASS |
| 13 | Boundary | C1001 / ORD-1001 / TS-1001, qty 0 | Rejected BR-3 | Rejected BR-3 | PASS |
| 14 | Validation | Complete request but reason is blank | Validation error | Validation error | PASS |
| 15 | Validation | preferredRefundMethod is "original_payment" | Validation error | Validation error | PASS |
| 16 | Validation | returnQuantity sent as text "1" instead of the number 1 | Validation error | Validation error | PASS |
| 17 | Validation | returnQuantity is true | Validation error | Validation error | PASS |
| 18 | Validation | reason is an object {} | Validation error | Validation error | PASS |
| 19 | Boundary | C1008 day 60, checked one day later (server left running overnight) | Approved | Approved | PASS |

Case 9 shows the trust boundary: the request claims the item is not final sale and is already Approved. The backend ignores both and reads its own record.

Case 19 checks that sample delivery dates are counted from the decision day. Before this fix they were fixed when the file loaded, so a server left running past midnight turned day 60 into day 61.

## 5. Testing Summary

- Total cases: 19
- Valid: 2
- Invalid: 7
- Boundary: 5
- Validation: 5
- Passed: 19
- Failed: 0

## 6. How to Run

```bash
npm run test:backend
```

(or `node backend/test-backend.js`). Actual output on 2026-10-30:

```text
✔ BR-1 return window (true means closed)
✔ BR-1 uses the store date in Houston, not the machine time zone
✔ BR-2 purchase verification
✔ BR-2 lookup returns only this order, with safe fields only
✔ BR-3 return quantity
✔ BR-4 final sale and clearance
✔ BR-5 one active request per item
✔ BR-6 decision names every failed rule
✔ Validation is not a rule rejection
✔ Validation: wrong data types are reported, never converted
✔ Sample delivery dates are counted from the decision day, not frozen at load time
✔ processReturnRequest: Approved, then BR-5 blocks a repeat (BR-7 history)
✔ The customer cannot send their own trusted values
ℹ tests 13
ℹ pass 13
ℹ fail 0
```

Each `node:test` test groups several of the cases in section 4.

## 7. Scope and Limits

- No HTTP, API, AWS, or database in Week 8. Week 9 adds the HTTP layer in `server/server.js` without changing these rules.
- Nothing is saved. Every result has `persisted: false`.
- BR-5 remembers approved items only while the process runs. Week 11 moves this to DynamoDB.
