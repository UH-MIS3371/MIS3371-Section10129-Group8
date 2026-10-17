
# TigerSteps — Week 8 Backend Testing

## 1. Purpose

This document records the Week 8 local backend validation tests for the TigerSteps online footwear return-request system.

The backend processes one return-request transaction using plain JavaScript and Node.js without relying on browser validation.

## 2. Business Rules Tested

- **BR-1 — Return Window:** A return must be submitted within 60 calendar days after delivery. Day 60 is eligible; day 61 is not.
- **BR-2 — Purchase Verification:** The Customer ID, Order ID, and item SKU must match a fictional purchase record.
- **BR-3 — Return Quantity:** The requested quantity must be a positive whole number and must not exceed the quantity purchased minus previously returned units.

## 3. Files and Environment

- Backend logic: `backend/backend.js`
- Test script: `backend/test-backend.js`
- Runtime: Node.js
- Test command: `node backend/test-backend.js`
- Test data: Fictional TigerSteps order-item records
- Database/API/AWS: Not used

## 4. Test Cases and Results

| # | Category | Test Scenario | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| 1 | Valid | Regular item, delivered 59 days ago, return quantity 1 | Approved | Approved | PASS |
| 2 | Valid | Second purchased SKU belonging to the same verified order | Approved | Approved | PASS |
| 3 | Invalid | Customer ID does not match the order (BR-2) | Rejected | Rejected | PASS |
| 4 | Invalid | Return quantity 3 exceeds 2 purchased (BR-3) | Rejected | Rejected | PASS |
| 5 | Boundary | Return exactly 60 days after delivery; return all 2 eligible units | Approved | Approved | PASS |
| 6 | Boundary | Return 61 days after delivery using a simulated next-day evaluation (BR-1) | Rejected | Rejected | PASS |

## 5. Testing Summary

The six prepared test cases produced the expected results during the initial test run.

- Total tests: 6
- Valid tests: 2
- Invalid tests: 2
- Boundary/edge tests: 2
- Passed: 6
- Failed: 0

The tests demonstrate that the backend independently checks purchase ownership, return-window eligibility, and return quantity.

## 6. Scope and Limitations

This Week 8 checkpoint implements BR-1, BR-2, and BR-3 only.

The backend operates independently of the Milestone 2 HTML, CSS, and browser JavaScript.

No HTTP requests, API endpoints, AWS services, database, or persistent transaction storage are implemented in this checkpoint.

Additional TigerSteps business rules remain part of the approved overall system design and will require backend enforcement in subsequent development.

## 7. Verification

To reproduce the results, run:

```bash
node backend/test-backend.js
```

Expected summary:

```text
TigerSteps Week 8 results: 6/6 tests passed.
```

Confirm that the actual output matches before marking the checkpoint complete.
