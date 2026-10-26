
# Week 9 — TigerSteps Local Frontend, Backend, and API Checkpoint (4 Points)

## Required Result

Continue developing our existing **TigerSteps Product Return Request System** by connecting the completed HTML, CSS, and JavaScript frontend to our local Node.js/Express backend using HTTP POST and JSON.

The existing frontend design, order lookup functionality, and business rules remain intact. The Express server communicates with our Week 8 backend logic to validate return requests and return an Approved or Rejected response.

**No AWS deployment or database integration is required for Week 9.**

## Project Files

- `TigerStep_Return_Form.html`: Existing return request form containing customer information, order lookup, item selection, return quantity, condition, and refund preferences.
- `tigerstep-style.css`: Existing CSS stylesheet responsible for the TigerSteps website design.
- `app_logic_final.js`: Frontend JavaScript responsible for order lookup, form validation, eligibility previews, and backend communication.
- `backend/backend.js`: Week 8 backend containing the `processReturnRequest()` function.
- `backend/test-backend.js`: Six backend test cases covering valid, invalid, and boundary scenarios.
- `backend/server.js`: Local Express server responsible for receiving JSON requests and passing them to the backend.
- `package.json`: Project dependencies and available Node.js commands.

## Backend Business Rules

The existing TigerSteps backend implements three primary business rules:

- **BR-1 — Return Window:** Returns must be submitted within 60 days of the verified delivery date.
- **BR-2 — Purchase Verification:** Customer ID, Order ID, and item SKU must match an existing purchase record.
- **BR-3 — Return Quantity:** The requested return quantity cannot exceed the remaining eligible quantity purchased.

Additional business rules will be implemented in future backend development.

## How to Run

### 1. Install Dependencies

Open the TigerSteps repository in Visual Studio Code.

From the repository root, run:

```bash
npm install
```

### 2. Start the Server

Run:

```bash
npm start
```

If an npm start script is not configured, use:

```bash
node backend/server.js
```

### 3. Open the Website

Once the server is running, open:

http://localhost:3000/

The TigerSteps return request form should appear with its existing styling and functionality.

### 4. Submit a Return Request

1. Enter a valid Customer ID and Order ID.
2. Click **Find My Order** to retrieve the fictional purchase information.
3. Select the item being returned.
4. Enter the return quantity, item condition, preferred refund method, and reason for return.
5. Click **Check Return Eligibility**.
6. Review the Approved or Rejected response returned by the backend.

The frontend sends the request to the Express server using `fetch()` with HTTP POST and JSON.

To stop the server, press **Control+C** in the terminal.

## Backend Testing

The existing backend tests can be executed independently of the HTML frontend.

From the repository root, run:

```bash
node backend/test-backend.js
```

### Six Backend Test Cases

| Test | Scenario | Expected Result |
|---|---|---|
| 1 | Regular item returned after 59 days | Approved |
| 2 | Second purchased SKU on the same verified order | Approved |
| 3 | Customer ID does not match the purchase record | Rejected — BR-2 |
| 4 | Return quantity exceeds purchased quantity | Rejected — BR-3 |
| 5 | Return submitted exactly 60 days after delivery | Approved |
| 6 | Return submitted 61 days after delivery | Rejected — BR-1 |

These tests verify that the backend independently enforces the existing TigerSteps business rules.

**Note:** Actual PASS/FAIL results should be documented after executing the tests.

## API Integration and Validation

The frontend communicates with the Express server through an HTTP POST request containing JSON.

### Required JSON Fields

The return request includes:

- `customerId`
- `orderId`
- `sku`
- `returnQuantity`
- `reason`
- `reportedCondition`
- `preferredRefundMethod`

### Expected API Responses

| Response | Meaning |
|---|---|
| HTTP 200 | Return request passes backend validation |
| HTTP 400 | Return request fails backend validation |
| Connection error | Local server cannot be reached |

Backend validation operates independently of frontend validation.

Even if someone bypasses the HTML form and sends JSON directly to the API, the backend must enforce the existing business rules.

**Important:** An Approved result indicates successful local validation only. It does not mean a return has been permanently saved or that a refund has been processed.

## Week 9 Submission Evidence / Checkpoint Review (4 Points)

The following requirements are based on the Week 9 grading criteria.

### 1. Server and JSON — 0.75 Points

- Working local Express server.
- HTTP POST endpoint accepts JSON requests.
- Server returns structured JSON responses.

### 2. Backend Reuse — 0.75 Points

- Existing Week 8 `processReturnRequest()` function is reused.
- Business rules are not unnecessarily duplicated in the server.

### 3. Frontend Integration — 1.00 Point

- Existing TigerSteps HTML form communicates with the backend using `fetch()`.
- Original CSS styling and functionality are preserved.
- No unnecessary duplicate frontend is created.

### 4. User Feedback — 0.50 Points

- Approved messages display correctly.
- Rejected messages display correctly.
- Connection errors are handled.

### 5. Testing and Documentation — 0.50 Points

- Six meaningful test scenarios.
- Expected and actual results documented.
- Valid, invalid, and boundary conditions tested.

### 6. Repository and Contributions — 0.50 Points

- Network request/response evidence.
- Readable instructions for running the application.
- Documented team member contributions.

**Total: 4.00 Points**

## Team Contributions

Team members contributed to the development and integration of the TigerSteps application, including:

- Frontend HTML and CSS development.
- JavaScript form validation and order lookup.
- Backend business rule implementation.
- Backend testing.
- Express server and API integration.
- Frontend-to-backend connection.

Individual contributions should be documented in the team's GitHub repository and activity tracker.

## Week 9 Scope

This checkpoint focuses on connecting the existing frontend and backend through a local Express API.

### Not Required for Week 9

- AWS Lambda or API Gateway deployment.
- DynamoDB or other database integration.
- Public website hosting.
- Permanent return request storage.
- Actual refund processing.

Cloud integration and database persistence will be introduced in subsequent course checkpoints.

## Conclusion

The objective of Week 9 is to demonstrate that the existing TigerSteps frontend, local Express server, and backend business rules communicate correctly through HTTP and JSON.

The application should allow users to submit return requests, receive backend validation results, and view clear approval, rejection, or connection-error messages without requiring cloud deployment or database storage.
