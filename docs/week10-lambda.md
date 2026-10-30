# TigerSteps: Week 10 Serverless Deployment on AWS

## 1. What Week 10 Adds

The whole system now runs on AWS with no server to manage. Nothing about the rules changed.

```
Browser (page from Amplify Hosting)
  | HTTP + JSON
API Gateway (HTTP API, payload format 2.0)   public URL, routes, CORS
  | event (body is JSON text)
Lambda: index.js -> backend/backend.js       decides, same code as on the laptop
  | { statusCode, headers, body }
API Gateway -> Browser
```

| Job | Week 9 (local) | Week 10 (AWS) |
|---|---|---|
| Serve the page | Express (`express.static`) | Amplify Hosting |
| Listen for HTTP, route requests | Express | API Gateway |
| Read JSON, call the backend, send the result | `server/server.js` | `index.js` in Lambda |
| Validate and decide BR-1 to BR-7 | `backend/backend.js` | `backend/backend.js`, unchanged |

`server/server.js` stays for local runs and tests. Neither it nor `index.js` holds any rule.

## 2. Files

| Path | Role |
|---|---|
| `index.js` | Lambda handler. `POST /api/returns`, `GET /api/orders`. Logs one line per request. Returns JSON 500 if something unexpected breaks |
| `backend/backend.js` | Rules and fictional orders. The only file `index.js` needs |
| `lambda-test/events/*.json` | Test events in API Gateway v2 format, ready to paste into the Lambda console |
| `lambda-test/test-lambda.js` | Runs the handler with those events on your laptop |
| `src/app.js` | `AWS_API_URL` near the top: paste the API Gateway Invoke URL there before building `frontend.zip` |
| `lambda.zip` | Built by `npm run zip:lambda`: `index.js` + `backend/backend.js` |
| `frontend.zip` | Built by `npm run zip:frontend`: `index.html`, `app.js`, `style.css` at the top level |

`src/app.js` picks the API by itself: opened at `localhost` it calls the local Express server; opened anywhere else it calls `AWS_API_URL`.

## 3. The ZIP and the Handler Setting

**Handler = `index.handler`** means "open `index.js` at the top level of the ZIP and call its export named `handler`". That is why `index.js` sits at the root of the repository and `lambda.zip` has no folder around it.

No Express and no `node_modules` go to Lambda: `backend.js` uses only what is built into Node.js.

## 4. Deployment Guide

Do the steps in this order. Each step needs a value from the step before it.

### 4.0 Before you start

```bash
npm run test:backend && npm run test:api && npm run test:lambda
npm run zip:lambda
```

In the AWS console, pick **one region** in the top right corner (for example US East (N. Virginia)) and stay in it for Lambda and API Gateway.

### 4.1 Lambda

1. Lambda > **Create function** > Author from scratch.
   - Function name: `tigersteps-returns`
   - Runtime: the newest **Node.js** version in the list
   - Create function.
2. **Code** tab > Upload from > **.zip file** > choose `lambda.zip` > Save.
3. **Code** tab > Runtime settings > confirm Handler is `index.handler`.
4. **Test** tab > Create new event. Paste the contents of `lambda-test/events/approved.json`, name it `approved`, Save, **Test**.
   - Correct: the response shows `"statusCode": 200` and a body containing `"status":"Approved"`.
5. Repeat with `rejected-br4.json` (expect `400`, `"rule":"BR-4"`), `minimal-console.json` (expect `200`) and `validation-blank-reason.json` (expect `400`, `"error":"Validation"`).
6. **Monitor** tab > View CloudWatch logs > newest log stream. Each test shows one line such as `[LAMBDA] POST /api/returns -> 400 Rejected BR-4 | persisted: false`.

### 4.2 API Gateway

1. API Gateway > **Create API** > **HTTP API** > Build.
2. Add integration: **Lambda**, same region, function `tigersteps-returns`. API name: `tigersteps-api`. Next.
3. Configure routes (both go to the same Lambda):
   - `GET` `/api/orders`
   - `POST` `/api/returns`
4. Stage: `$default`, **Auto-deploy** on. Next, Create.
5. Copy the **Invoke URL** from the API details page, for example `https://abc123.execute-api.us-east-1.amazonaws.com`.
6. Test from the terminal (replace `INVOKE_URL`):

```bash
curl -i "INVOKE_URL/api/orders?customerId=C1004&orderId=ORD-1004"

curl -i -X POST "INVOKE_URL/api/returns" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"C1003","orderId":"ORD-1003","sku":"TS-2001","returnQuantity":1,"reason":"Does not fit","reportedCondition":"unworn","preferredRefundMethod":"store-credit","finalSale":false,"status":"Approved"}'
```

   Correct: the first returns `200` with two items and no `finalSale` field. The second returns `400` with `"rule":"BR-4"`, even though it claims the item is not final sale.

The console adds the permission that lets API Gateway call the Lambda when you pick the function in step 2.

### 4.3 Connect the frontend to the API

1. Open `src/app.js` and paste the Invoke URL into `AWS_API_URL` (no `/` at the end):

```js
const AWS_API_URL = 'https://abc123.execute-api.us-east-1.amazonaws.com';
```

2. Build the page bundle:

```bash
npm run zip:frontend
```

3. Check locally that nothing broke: `npm start`, open http://localhost:3000. It still uses the local server.

### 4.4 Amplify Hosting

1. AWS Amplify > **Create new app** > **Deploy without Git**.
2. App name `tigersteps`, branch or environment name `main`.
3. Drag `frontend.zip` into the upload area > Save and deploy.
4. When it finishes, copy the domain, for example `https://main.d1a2b3c4.amplifyapp.com`.

To publish a change later: edit, run `npm run zip:frontend` again, and upload the new zip with **Deploy updates**.

### 4.5 CORS on API Gateway

The page (Amplify domain) and the API (execute-api domain) are on different domains. The browser blocks the request unless the API says that domain is allowed. Sending JSON with POST also makes the browser send a test request (OPTIONS, called a preflight) first; API Gateway answers it once CORS is set.

API Gateway > `tigersteps-api` > **CORS** > Configure:

| Setting | Value |
|---|---|
| Access-Control-Allow-Origin | your Amplify domain exactly, for example `https://main.d1a2b3c4.amplifyapp.com` (https, no `/` at the end) |
| Access-Control-Allow-Methods | `GET`, `POST` |
| Access-Control-Allow-Headers | `content-type` |

Save. Auto-deploy publishes it.

### 4.6 End-to-end test

Open the Amplify domain. Open DevTools > **Network**. Run the cases in section 6 rows 7 to 12 and take screenshots of the Network tab (request URL on `execute-api`, payload, status, response).

### 4.7 When something goes wrong

| What you see | Most likely cause | Fix |
|---|---|---|
| Browser console says "blocked by CORS policy" | Allowed origin does not match the page exactly | Copy the domain from the address bar; check `https`, no `/` at the end, header `content-type`, methods GET and POST |
| Form says "Cannot reach the TigerSteps service" | CORS (above), or `AWS_API_URL` was empty or wrong when you built `frontend.zip` | Check the request URL in Network; fix `AWS_API_URL`, rebuild, Deploy updates |
| `{"message":"Not Found"}` | Route path does not match, or a stage other than `$default` (then the URL needs `/stage-name`) | Routes must be exactly `/api/orders` and `/api/returns` |
| `{"message":"Internal Server Error"}` and no `[LAMBDA]` line in CloudWatch | API Gateway could not run the Lambda | Re-select the Lambda in the integration so the console adds its permission |
| Lambda test shows `Runtime.ImportModuleError` / cannot find `index` | `index.js` is not at the top level of the zip, or Handler is not `index.handler` | Rebuild with `npm run zip:lambda`; check Runtime settings |
| Form says "The return service had a problem (HTTP 500)" | Something broke inside the Lambda | CloudWatch shows `[LAMBDA] ... failed:` with the details |
| Amplify page is blank or 404 | `index.html` is not at the top level of the zip | Rebuild with `npm run zip:frontend` (it zips the files, not the folder) |
| A change does not show up | Old zip still deployed, or browser cache | Rebuild, upload again, hard reload the page |

### 4.8 Cost and clean up

- Usage for this project is tiny, but set a safety net: Billing > **Budgets** > create a budget with an email alert.
- After grading, delete in this order: Amplify app, API Gateway API, Lambda function, and its CloudWatch log group (`/aws/lambda/tigersteps-returns`).

## 5. Handler Tests (Laptop)

`npm run test:lambda`, run with `TZ=UTC` to match Lambda's clock. "Actual" is the real handler output on 2026-10-30.

| # | Category | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Valid | `approved.json`: C1001 / ORD-1001 / TS-1001, qty 1 | 200 Approved | 200 Approved | PASS |
| 2 | Invalid | `approved.json` again, same warm instance | 400 Rejected BR-5 | 400 Rejected BR-5 | PASS |
| 3 | Invalid | `rejected-br4.json`: C1003 final sale sent with `finalSale: false`, `status: "Approved"` | 400 Rejected BR-4 | 400 Rejected BR-4 | PASS |
| 4 | Valid | `minimal-console.json`: no `routeKey`, like the Amazon Q event (C1008, day 60) | 200 Approved | 200 Approved | PASS |
| 5 | Validation | `validation-blank-reason.json`: reason is blank | 400 Validation | 400 Validation | PASS |
| 6 | Validation | `invalid-json.json`: body is `{not json` | 400 Validation | 400 Validation | PASS |
| 7 | Valid | `lookup.json`: GET C1004 / ORD-1004 | 200, 2 items, no finalSale field | 200, 2 items, no finalSale field | PASS |
| 8 | Invalid | `lookup.json` with C1002 / ORD-1001 | 404 | 404 | PASS |
| 9 | Invalid | Method DELETE | 405 | 405 | PASS |
| 10 | Error | Backend throws an unexpected error (simulated) | 500 Server | 500 Server | PASS |

Total: 10. Passed: 10. Failed: 0. The test file also checks that each request logs exactly one line and never logs the customer's reason.

## 6. AWS Tests (fill in after running them)

| # | Where | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 1 | Lambda console | `approved.json` | 200 Approved | | |
| 2 | Lambda console | `rejected-br4.json` | 400 Rejected BR-4 | | |
| 3 | Lambda console | `minimal-console.json` | 200 Approved | | |
| 4 | Lambda console | `validation-blank-reason.json` | 400 Validation | | |
| 5 | API Gateway (curl) | `GET /api/orders` C1004 / ORD-1004 | 200, no finalSale field | | |
| 6 | API Gateway (curl) | `POST /api/returns` BR-4 request in 4.2 | 400 Rejected BR-4 | | |
| 7 | Amplify page | Open the Amplify domain | Form loads with styling | | |
| 8 | Amplify page | Find my order: C1001 / ORD-1001 | 2 items listed; Network GET 200 to execute-api | | |
| 9 | Amplify page | Submit C1001 / ORD-1001 / TS-1001, qty 1 | Approved; Network POST 200 | | |
| 10 | Amplify page | C1003 / ORD-1003 / TS-2001 | Item shows "cannot be returned"; submit gives Rejected BR-4, POST 400 | | |
| 11 | Amplify page | Remove `required` from Reason in DevTools, submit blank | Validation message, status rail stays on Draft, POST 400 | | |
| 12 | CloudWatch | Log stream after rows 8 to 11 | One `[LAMBDA]` line per request | | |

A test event in the Lambda console does not prove that API Gateway or the hosted page works. Rows 5 to 12 test those separately.

## 7. Limits

- **BR-5 on Lambda.** Approved items are remembered in memory. Each Lambda instance has its own memory, AWS can stop an instance at any time, and two requests at once can go to two instances. Running `approved.json` twice may give BR-5 the second time (same warm instance) or Approved again (new instance). Week 11 stores requests in DynamoDB to fix this.
- **Dates.** BR-1 uses the store's date in Houston (`America/Chicago`), so Lambda (UTC) and the laptop give the same answer.
- **Nothing is saved.** Every result has `persisted: false`.
- **The API is public.** Anyone with the Invoke URL can call it. That is acceptable here because all data is fictional (NFR-5).
