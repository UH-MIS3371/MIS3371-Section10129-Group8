# TigerSteps: Week 11 Save and View a Return (DynamoDB)

**Live site:** https://staging.d1ll6q5a6re1aj.amplifyapp.com

## 1. What Week 11 Adds

Approved returns are now saved in DynamoDB, and the customer can look one up later by its confirmation number.

```
POST /api/returns            -> backend decides -> Approved: save in DynamoDB -> confirmation number, persisted: true
GET  /api/returns/{returnId} -> read one saved return -> show its status
```

The business rules did not change, and `backend/backend.js` was not edited. `index.js` (the Lambda handler) now also talks to the database.

| Course example | TigerSteps |
|---|---|
| Table `MIS3371-Expenses`, key `transactionId` | Table `MIS3371-Group8-BR5-table`, key `returnId` (String), no sort key |
| Environment variable `TABLE_NAME` | `TABLE_NAME` = `MIS3371-Group8-BR5-table` |
| ID `EXP-...` | `RR-...` (random UUID), created by the Lambda, never by the customer |
| `GET /api/expenses/{transactionId}` | `GET /api/returns/{returnId}` |

`returnId` is TigerSteps' transaction ID. It is the same system field already listed in the data contract.

## 2. Files

| Path | Change |
|---|---|
| `index.js` | POST saves Approved returns; new GET by `returnId`; database code in one `database` object |
| `src/index.html` | Confirmation number panel and a "View a saved return" form in the Request status card |
| `src/app.js` | Shows the confirmation number only when `persisted: true`; View status calls GET |
| `src/style.css` | Styles for the two new parts |
| `server/server.js` | Local `GET /api/returns/:returnId` explains that saved returns live on AWS only |
| `lambda-test/` | New `get-return.json`, `get-return-not-found.json`; handler tests use an in-memory database |

## 3. What Is Saved

- **Only Approved returns are saved.** Validation errors and Rejected decisions return HTTP 400 and are never written.
- The saved record holds the seven data contract fields plus trusted values from the backend: `returnId`, `status`, `statusHistory`, `submittedAt`, `decidedAt`, `itemKey`. Phone, email, and any system field the customer sends (for example `status` or `finalSale`) are never stored.
- `persisted: true` is returned only after the database write succeeds.
- If the write fails, the answer is HTTP 500 with `persisted: false` and no confirmation number. The error details go to CloudWatch only.

**BR-5 (one active request per item).** With each approved return, the Lambda also saves a small marker item with the key `ACTIVE#<customer|order|sku>`. Before deciding, it reads that marker and tells the backend whether the item already has an active request; the backend makes the BR-5 decision. The return and its marker are written together, and only if the marker does not exist yet, so two requests at the same moment cannot both be approved. A Scan of the table shows both kinds of items. GET never shows a marker.

**Why `TransactWriteCommand` and not `PutCommand`.** The course prompt saves one record with `PutCommand`. TigerSteps has to save two items for one approval: the return and its BR-5 marker. Two separate `PutCommand` calls could leave a return without a marker if the second call fails, and two customers clicking at the same moment could both pass the marker check and both be approved. `TransactWriteCommand` writes both items in one step, each with the condition `attribute_not_exists(returnId)`: either both are saved or neither is, and the second request at the same moment fails the condition and gets Rejected by BR-5. Reading one return still uses `GetCommand`, as in the course prompt.

## 4. AWS Steps, Session 1 (database, Lambda, API)

Work in the AWS Academy Learner Lab, Region **us-east-1**. Build the package first, from the Milestone 3 folder:

```bash
cd "Milestone 3"
npm run test:lambda
npm run zip:lambda
```

1. **DynamoDB** > Create table. Name `MIS3371-Group8-BR5-table`. Partition key `returnId`, type **String**. No sort key. Default settings. Create, then wait until the status is **Active**.
2. **Lambda** > `tigersteps-returns` > Configuration > **Permissions**: keep **LabRole**. A message such as `iam:GetPolicy denied` is normal in the lab; do not change IAM.
3. Configuration > **Environment variables** > Edit > add `TABLE_NAME` = `MIS3371-Group8-BR5-table` > Save. Check that it is listed.
4. Code > Upload from > .zip file > the new `lambda.zip`. Handler stays `index.handler`.
5. **Test** tab: run `approved.json`. Expect `statusCode: 200`, `"persisted":true`, and a `returnId` starting with `RR-`. Copy that `returnId`.
6. **DynamoDB** > `MIS3371-Group8-BR5-table` > Explore table items > **Scan** > Run. You should see the return (key `RR-...`) and its marker (key `ACTIVE#C1001|ORD-1001|TS-1001`). Open the return and check its fields.
7. **API Gateway** > `tigersteps-api` > Routes > Create: `GET` `/api/returns/{returnId}`. Then Integrations: attach the **same** Lambda integration used by POST (payload 2.0). Do not create a second API.
8. Lambda **Test**: paste `get-return.json`, replace `RR-PASTE-THE-CONFIRMATION-NUMBER-HERE` (in all three places) with the copied `returnId`, run. Expect `200` with `returnRequest`. Also run `get-return-not-found.json`: expect `404`.
9. With auto-deploy on the `$default` stage, open `<Invoke URL>/api/returns/<returnId>` in a normal browser tab. It shows the saved return as JSON.

## 5. AWS Steps, Session 2 (frontend)

1. **CORS** on `tigersteps-api`: Allow origin `https://staging.d1ll6q5a6re1aj.amplifyapp.com`, methods `GET` and `POST`, header `content-type`.
2. Build the page bundle: `npm run zip:frontend`.
3. **Amplify** > the existing app > **Deploy updates** > upload `frontend.zip`. Same URL as before.
4. On the live site: submit C1004 / ORD-1004 / TS-1001, quantity 1 (an item not used in the console tests). The confirmation number appears and fills the View status box. Select **View status**; the saved status appears. Refresh the page, paste the number again, and view it again.

## 6. Handler Tests (Laptop)

`npm run test:lambda` runs 22 tests with an in-memory database in place of DynamoDB (no AWS account needed). The rows below are real handler output on 2026-11-08, run with `TZ=UTC`.

| # | Category | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Valid | POST `approved.json` (C1001 / ORD-1001 / TS-1001, qty 1) | 200 Approved, persisted: true | 200 Approved, persisted: true | PASS |
| 2 | Invalid | POST `approved.json` again | 400 Rejected BR-5, nothing saved | 400 Rejected BR-5, nothing saved | PASS |
| 3 | Boundary | Two requests at once: the marker write fails (simulated) | 400 Rejected BR-5 | 400 Rejected BR-5 | PASS |
| 4 | Invalid | POST `rejected-br4.json` (final sale, sends `finalSale: false`, `status: "Approved"`) | 400 Rejected BR-4, nothing saved | 400 Rejected BR-4, nothing saved | PASS |
| 5 | Validation | POST `validation-blank-reason.json` | 400 Validation, nothing saved | 400 Validation, nothing saved | PASS |
| 6 | Valid | GET with the confirmation number from row 1 | 200 Approved, same returnId | 200 Approved, same returnId | PASS |
| 7 | Invalid | GET `get-return-not-found.json` | 404 not found | 404 not found | PASS |
| 8 | Validation | GET with a blank confirmation number | 400 A confirmation number is required. | 400 A confirmation number is required. | PASS |
| 9 | Trust | GET a BR-5 marker key `ACTIVE#C1001\|ORD-1001\|TS-1001` | 404 not found | 404 not found | PASS |
| 10 | Error | POST while the DynamoDB read fails (simulated) | 500 Server, persisted: false | 500 Server, persisted: false | PASS |
| 11 | Error | POST with no `TABLE_NAME` set | 500 Server, persisted: false | 500 Server, persisted: false | PASS |
| 12 | Error | POST Approved, but the DynamoDB write fails (simulated) | 500 Server, persisted: false, no `returnId`, nothing saved | 500 Server, persisted: false, no `returnId`, nothing saved | PASS |

Total: 12. Passed: 12. Failed: 0.

The real DynamoDB calls are tested in section 7 on AWS, the same way the course slides test them.

## 7. AWS and Browser Tests (fill in after running them)

| # | Where | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Lambda console | `approved.json` | 200, `persisted: true`, `returnId` starts with `RR-` | 200 Approved, `persisted: true`, `RR-b1886c24-cce4-4afb-ae88-5364c4e730fb` (2026-11-09) | PASS |
| 2 | DynamoDB Scan | After rows 1, 3, and 4 | The return item and its `ACTIVE#...` marker exist, nothing else | 2 items: `RR-b1886c24-...` (customerId C1001, itemKey, decidedAt) and `ACTIVE#C1001\|ORD-1001\|TS-1001` (activeReturnId = `RR-b1886c24-...`, createdAt) (2026-11-09) | PASS |
| 3 | Lambda console | `approved.json` again | 400 Rejected BR-5 | 400 Rejected BR-5, `persisted: false` (2026-11-09) | PASS |
| 4 | Lambda console | `rejected-br4.json` (also sends `finalSale: false` and `status: "Approved"`) | 400 Rejected BR-4; no new item in the table | 400 Rejected BR-4, `persisted: false`; the client's `finalSale` and `status` were ignored (2026-11-09). Table check: see row 2 | PASS |
| 5 | Lambda console | `get-return.json` with the ID from row 1 | 200 with `returnRequest` | 200, `returnRequest` for `RR-b1886c24-...`: C1001 / ORD-1001 / TS-1001, qty 1, status Approved, same `submittedAt` and `decidedAt` as row 1 (2026-11-09) | PASS |
| 6 | Lambda console | `get-return-not-found.json` | 404 | 404 "Return not found. Check the confirmation number.", no record returned (2026-11-09) | PASS |
| 7 | Browser tab | `<Invoke URL>/api/returns/<ID from row 1>` | Saved return as JSON | `{"success":true,"returnRequest":{...}}` for `RR-b1886c24-...`, status Approved, same fields as row 5 (2026-11-09) | PASS |
| 8 | Live site | Submit C1004 / ORD-1004 / TS-1001, qty 1 | Approved and saved; confirmation number shown | | |
| 9 | Live site | View status with that number | Status Approved, item TS-1001, quantity 1 | | |
| 10 | Live site | View status with `RR-00000000-0000-0000-0000-000000000000` | "Return not found" message, no record shown | | |
| 11 | Live site | Submit C1003 / ORD-1003 / TS-2001 | Rejected BR-4; no confirmation number | | |

## 8. When Something Goes Wrong

| What you see | Most likely cause | Fix |
|---|---|---|
| 500 `"Database configuration error."` | `TABLE_NAME` is not set on the Lambda | Add it (section 4, step 3) |
| `Task timed out after 3.00 seconds` | The default 3 second limit is too short for the first database call | Configuration, General configuration: Timeout 10 sec, Memory 256 MB. Still timing out: Configuration, VPC must be empty |
| 500 `"Something went wrong. Please try again."` | A database call failed | Monitor, View CloudWatch logs: read the line after `[LAMBDA] ... failed:` and use the rows below |
| 500 and CloudWatch shows `ResourceNotFoundException` | Table name or Region does not match | Same name as `TABLE_NAME`, and both in us-east-1 |
| 500 and CloudWatch shows `Value ' ...' at 'tableName' failed to satisfy constraint` | The `TABLE_NAME` value has a space at the start or end | Clear the value and paste the table name again |
| Not sure of the exact table name | `-` and `_` look alike | CloudShell: `aws dynamodb list-tables --region us-east-1`, copy the name from the output |
| 500 and CloudWatch shows `AccessDeniedException` | The role cannot use DynamoDB | Confirm the function uses LabRole |
| 500 and CloudWatch shows `Cannot find module '@aws-sdk/client-dynamodb'` | The runtime is too old to include the AWS SDK v3 | Runtime settings: Node.js 20.x or later |
| `{"message":"Not Found"}` for GET | The GET route is missing, not deployed, or has no integration attached (an HTTP API route with no integration answers Not Found) | Routes: the path must be `/api/returns/{returnId}`. Integrations: attach the existing Lambda integration. Then Deploy to `$default` |
| View status fails on the live site but works in a browser tab | CORS does not allow GET | Section 5, step 1 |
| No confirmation number after Approved | `persisted` was not `true` (for example on the local server) | Expected locally; on AWS check rows 1 and 2 |

## 9. Limits

- The local Express server (`npm start`) does not save: it still answers `persisted: false`, and View status there explains that saved returns live on AWS only.
- **One table, as Week 11 asks.** The table holds only approved returns and their BR-5 markers. Order records are still the fictional list `ORDER_ITEMS` in `backend/backend.js` (NFR-5), because Week 11 keeps `backend.js` unchanged.
  - How the two are matched: on each submit the backend finds the order record by `customerId`, `orderId`, and `sku` (BR-2) and uses its fields for BR-1, BR-3, and BR-4. BR-5 uses the same three values, joined as `itemKey`, to look for the `ACTIVE#<itemKey>` marker in DynamoDB. Every saved return keeps `itemKey`, so it points back to its order record.
  - What this does not do: saving a return does not update `quantityPreviouslyReturned`. The order lookup still shows the full balance and `returnable: true` for an item that already has an approved return (for example `remainingEligibleQuantity: 2` for C1001 / TS-1001). The decision is still correct, because BR-5 rejects a second request for the same item.
  - Future work: a real system would keep orders in a second table (for example `Orders`). The Lambda would read the order record from that table and pass it to the backend, and an approved return would update the returned quantity. This needs a change to `backend.js`, so it is left for a later week.
- BR-5 markers stay until you delete them, so each returnable item can be approved once. To repeat a demo, open Explore table items and delete that item's return and its `ACTIVE#...` marker. `approved.json` uses C1001 / TS-1001 and `minimal-console.json` uses C1008 / TS-1003.
- Learner Lab sessions time out. Start the lab again before testing.
