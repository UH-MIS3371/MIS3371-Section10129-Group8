# TigerSteps: Milestone 3

The TigerSteps return request system with a trusted backend, a local API, and a serverless deployment on AWS that saves approved returns in DynamoDB.

**Live site:** https://staging.d1ll6q5a6re1aj.amplifyapp.com

## What Changed Since Milestone 2

Milestone 2 (the client-only form) is on the `main` branch and in git history.

| | Milestone 2 | Milestone 3 |
|---|---|---|
| Where the rules run | In the browser (`app_logic_final.js`) | In the backend (`backend/backend.js`) only |
| Order records | Inside the browser JavaScript | On the server; the browser gets safe fields only |
| How the form gets a decision | Decides by itself | Sends JSON to the API and shows the backend's answer |
| Hosting | Open the HTML file | Amplify (page) + API Gateway + Lambda (rules) + DynamoDB (saved returns) |
| After submitting | Nothing is kept | Approved returns are saved; the customer gets a confirmation number and can view the return later |

Business rules BR-1 to BR-7 are the same. Anyone who skips the form and sends a request straight to the API still gets the same decision.

## How It Fits Together

```
Browser (src/)  -- HTTP + JSON -->  API  -->  backend/backend.js decides
                                    |
                     local:  server/server.js (Express, nothing saved)
                     AWS:    API Gateway + index.js (Lambda) <-> DynamoDB
```

| Path | Role |
|---|---|
| `src/` | The return form: `index.html`, `app.js`, `style.css`. No rules, no order data |
| `backend/backend.js` | Validation and BR-1 to BR-7. The only place a return is decided |
| `server/server.js` | Local Express server: serves `src/` and the two API routes |
| `index.js` | AWS Lambda handler: order lookup, submit (saves Approved returns to DynamoDB), and view a saved return |
| `lambda-test/` | API Gateway test events and Lambda handler tests |
| `docs/` | Week 8, 9, and 10 notes with test evidence |

## How to Run Locally

Needs Node.js 18 or later. Run every command from this folder:

```bash
cd "Milestone 3"
npm install          # once, installs Express
npm start            # then open http://localhost:3000
```

## Tests

```bash
npm run test:backend # backend rules
npm run test:api     # local API, sending JSON without the form
npm run test:lambda  # Lambda handler with API Gateway events
```

## Deploy to AWS

```bash
npm run zip:lambda   # lambda.zip for AWS Lambda
npm run zip:frontend # frontend.zip for Amplify Hosting
```

Step by step: `docs/week10-lambda.md`, section 4.

## Weekly Notes

- `docs/week8-backend-testing.md`: backend rules and 19 test cases
- `docs/week9-local.md`: local Express API and 9 API test cases
- `docs/week10-lambda.md`: Lambda, API Gateway, Amplify, CORS, and AWS test evidence
- `docs/week11-dynamodb.md`: DynamoDB save, confirmation number, View status, and test evidence

## Limits

- Only the AWS version saves. The local server answers `persisted: false` and cannot look up saved returns.
- On AWS, BR-5 (one active request per item) is kept in DynamoDB, so each returnable item can be approved once. Locally it is kept in memory.
- All data is fictional (NFR-5).
