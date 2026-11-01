# TigerSteps Data Dictionary

This document defines every data field in one TigerSteps online return request. It is the data contract for the whole system: the HTML form, the browser JavaScript, the backend, the API, and later the database all use the same field names listed here.

## Field Categories

| Category | Meaning | Who controls it |
|---|---|---|
| User-entered | The customer types the value on the form | Customer |
| User-selected | The customer chooses from a list the system provides | Customer, limited by the system |
| Order record | Copied from the fictional TigerSteps order record after lookup. Read-only | System |
| Derived | Calculated from other fields | System |
| System | Created and controlled only by the application | System |
| Audit | Timestamps and history used to rebuild what happened | System |

## Core Fields

| Field name | Display name | Category | Meaning | Type | Required? | Source | Rule / Constraint | Example |
|---|---|---|---|---|---|---|---|---|
| `returnId` | Return ID | System | Unique ID for one return request | Text | System | Backend | Must be unique. Created by the backend when the request is submitted, never by the browser | `RR-1025` |
| `customerId` | Customer ID | User-entered | Identifies the customer making the return | Text | Yes | Customer | Max 12 characters. Must match the order (BR-2) | `C1001` |
| `orderId` | Order ID | User-entered | Identifies the original purchase | Text | Yes | Customer | Max 12 characters. Must be a TigerSteps order that belongs to the customer (BR-2) | `ORD-1001` |
| `sku` | Item SKU | User-selected | Identifies the footwear item being returned | Text | Yes | Customer chooses from items on the verified order | Must be an item on that order (BR-2) | `TS-1001` |
| `returnQuantity` | Return Quantity | User-entered | Number of units the customer wants to return | Whole number | Yes | Customer | At least 1 and no more than `remainingEligibleQuantity` (BR-3) | `1` |
| `reason` | Return Reason | User-entered | Customer's reason for the return | Text | Yes | Customer | Not blank. Max 250 characters | `Wrong size` |
| `reportedCondition` | Item Condition | User-selected | Condition of the item as reported by the customer | Text (list) | Yes | Customer | One of: `unworn`, `worn`, `damaged` | `unworn` |
| `preferredRefundMethod` | Preferred Refund Method | User-selected | How the customer wants to be refunded | Text (list) | Yes | Customer | One of: `original-payment`, `store-credit`. The refund itself is out of scope | `original-payment` |
| `phone` | Phone Number | User-entered | Optional contact phone number | Text | No | Customer | If provided, format `###-###-####`. Not used for eligibility | `713-555-0123` |
| `email` | Email Address | User-entered | Optional contact email | Text | No | Customer | If provided, must be a valid email format. Not used for eligibility | `name@example.com` |
| `receiptAvailable` | Receipt Available | User-entered | Customer says a receipt or order confirmation is available | True / False | No | Customer | Optional checkbox. No file upload. Not used for eligibility | `true` |
| `quantityPurchased` | Quantity Purchased | Order record | Units of this item bought on the order | Whole number | Yes | Order record | Filled after lookup. Customer cannot edit | `2` |
| `quantityPreviouslyReturned` | Quantity Previously Returned | Order record | Units of this item already returned before | Whole number | Yes | Order record | Filled after lookup. Customer cannot edit | `0` |
| `deliveryDate` | Delivery Date | Order record | Date the order was delivered | Date (`YYYY-MM-DD`) | Yes | Order record | Filled after lookup. Customer cannot edit. Used for the 60-day window (BR-1) | `2026-09-01` |
| `finalSale` | Final Sale | Order record | The item was sold as FINAL SALE | True / False | Yes | Order record | If `true`, the request is rejected (BR-4) | `false` |
| `clearance` | Clearance | Order record | The item was bought at a clearance price | True / False | Yes | Order record | If `true`, the request is rejected (BR-4) | `false` |
| `remainingEligibleQuantity` | Remaining Eligible Quantity | Derived | Units still allowed to be returned | Whole number | System | Backend | `quantityPurchased` minus `quantityPreviouslyReturned` (BR-3) | `2` |
| `status` | Status | System | Current state of the return request | Text (list) | System | Backend | One of: `Draft`, `Submitted`, `Approved`, `Rejected`. Must follow the allowed order (BR-7) | `Submitted` |
| `decision` | Decision | Derived | Result of checking the return rules | Text (list) | Conditional | Backend | `Approved` if every rule passes, otherwise `Rejected` (BR-6). Set after evaluation | `Approved` |
| `decisionReason` | Decision Reason | Derived | Explains why the request was rejected | Text | Conditional | Backend | Required when `decision` is `Rejected`. Lists every rule that failed | `Return window expired` |
| `submittedAt` | Submitted Timestamp | Audit | Date and time the request was submitted | Date and time (ISO 8601) | System | Backend clock | Set when the status becomes `Submitted` | `2026-10-27T14:15:00-05:00` |
| `decidedAt` | Decision Timestamp | Audit | Date and time the decision was made | Date and time (ISO 8601) | Conditional | Backend clock | Set when the status becomes `Approved` or `Rejected` | `2026-10-27T14:15:01-05:00` |
| `statusHistory` | Status History | Audit | Record of every status change | List of { `status`, `changedAt` } | System | Backend | Add one entry for each status change. Never edit or delete old entries | `[{Submitted, 14:15:00}, {Approved, 14:15:01}]` |

**Required? values:** Yes = the customer must provide it. No = optional. System = always created by the system, never typed by the customer. Conditional = exists only after a certain event.

## Fields the Customer Must Never Control

The backend must ignore these fields if they arrive in a request, and use its own values instead:

- `returnId`, `status`, `decision`, `decisionReason`
- `submittedAt`, `decidedAt`, `statusHistory`
- every Order record field: `quantityPurchased`, `quantityPreviouslyReturned`, `deliveryDate`, `finalSale`, `clearance`
- `remainingEligibleQuantity`

For example, a customer must not be able to send `deliveryDate` = yesterday to pass the 60-day window, or `status` = `Approved`.

## Form Mapping

Only some fields appear on the form. The **HTML id (current)** column shows the id used in the form today. Ids that differ from the field name should be renamed to match when the form is rebuilt.

| Field name | On the form? | HTML id (current) | Control |
|---|---|---|---|
| `customerId` | Yes, editable | `CustomerID` | Text input |
| `phone` | Yes, editable | `custPhone` | Phone input |
| `email` | Yes, editable | `custEmail` | Email input |
| `orderId` | Yes, editable | `orderID` | Text input |
| `sku` | Yes, after lookup | `itemSKU` | Drop-down, locked until the order is found |
| `quantityPurchased` | Yes, read-only | `quantityPurchased` | Number, filled after lookup |
| `deliveryDate` | Yes, read-only | `dayDelivered` | Date, filled after lookup |
| `quantityPreviouslyReturned`, `remainingEligibleQuantity` | Shown as text | `orderSummary` | Summary line |
| `returnQuantity` | Yes, editable | `returnQuantity` | Number input |
| `reportedCondition` | Yes, editable | `reportedCondition` | Drop-down |
| `preferredRefundMethod` | Yes, editable | `preferredRefundMethod` | Drop-down |
| `reason` | Yes, editable | `description` | Text area |
| `receiptAvailable` | Yes, editable | `receiptAttached` | Checkbox |
| `status` | Shown as text | `returnState` | Status line |
| `decision`, `decisionReason` | Shown as text | `returnMessage` | Result message |
| `finalSale`, `clearance`, `returnId`, timestamps, `statusHistory` | No | n/a | Backend only |

## Request Sent to the API

`POST /api/returns` sends only the fields needed to evaluate the request:

```json
{
  "customerId": "C1001",
  "orderId": "ORD-1001",
  "sku": "TS-1001",
  "returnQuantity": 1,
  "reason": "Wrong size",
  "reportedCondition": "unworn",
  "preferredRefundMethod": "original-payment"
}
```

`phone`, `email`, and `receiptAvailable` are not used for the decision. Add them to this request only when the team starts saving full records in the database.

## Implementation Status (October 27, 2026)

| Fields | Milestone 2 (browser) | Week 8–9 backend | Planned |
|---|---|---|---|
| User-entered and user-selected fields | Yes | Yes (the 7 API fields) | n/a |
| Order record fields | Yes, from fictional records in the browser | Yes, from fictional records in the backend (`finalSale` and `clearance` not checked yet) | DynamoDB (Week 11) |
| `decision`, `decisionReason` | Yes | Partly (stops at the first failed rule) | n/a |
| `returnId`, `status`, timestamps, `statusHistory` | No (M2 is a preview only, no record is saved) | No | Backend + DynamoDB (Week 11) |
