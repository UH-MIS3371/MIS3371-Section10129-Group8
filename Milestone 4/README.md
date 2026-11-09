# TigerSteps: Milestone 4

The TigerSteps return request system with a trusted backend, a local API, and a serverless deployment on AWS that saves approved returns in DynamoDB.

**Live site:** https://staging.d1ll6q5a6re1aj.amplifyapp.com (runs this version)

## What Changed Since Milestone 3

Milestone 3 (`../Milestone 3/`) moved the rules to the backend and deployed it on AWS, but saved nothing. Milestone 4 adds the database (Week 11).

| | Milestone 3 | Milestone 4 |
|---|---|---|
| Hosting | Amplify (page) + API Gateway + Lambda (rules) | Same, plus DynamoDB (saved returns) |
| After an Approved decision | Nothing is kept (`persisted: false`) | The return is saved; the customer gets a confirmation number (`persisted: true`) |
| View a return later | Not possible | View status form, `GET /api/returns/{returnId}` |
| BR-5 (one active request per item) on AWS | Kept in Lambda memory, lost on restart | Kept in DynamoDB as an `ACTIVE#<itemKey>` marker |
| Lambda tests | Handler only | Handler plus an in-memory stand-in for DynamoDB (22 tests) |

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
| `docs/` | Week 8 to 11 notes with test evidence |

## How to Run Locally

Needs Node.js 18 or later. Run every command from this folder:

```bash
cd "Milestone 4"
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
