# TigerSteps — Online Footwear Return Request System

**MIS 3371 | Milestone 1 — Project Definition**

A web-based transaction system that lets a TigerSteps customer submit a footwear return request online, have it evaluated automatically against company return rules, and receive an immediate approved or rejected decision with a trackable status.

---

## 1. What Problem Are We Solving?

TigerSteps currently handles footwear returns in person at physical store locations. A customer has to travel to a store and present a physical or digital receipt. A store employee then manually compares the receipt and order information against TigerSteps' records to verify the purchase and decide whether the return is eligible.

This creates three problems. It is inconvenient for the customer, who must make a trip to a store. It is time-consuming for employees, who repeat the same manual verification for every return. And it produces inconsistent outcomes, because return rules are applied by hand and customers have limited visibility into where their return stands.

**Why it matters.** Moving the return request online and evaluating it against a defined rule set reduces unnecessary store visits, cuts manual verification work, applies return policy consistently across every request, and gives the customer a clear decision and a status they can check themselves.

---

## 2. What Is the Main Transaction?

The system is built around a single business transaction: **a customer submits one online footwear return request for a previous TigerSteps purchase.**

| Field | Description |
|---|---|
| **Event** | A customer submits one online footwear return request for a previous TigerSteps purchase. |
| **Trigger** | The customer decides to return footwear from a previous TigerSteps purchase. |
| **Inputs** | Customer ID, order number, item being returned, return quantity, return reason, reported item condition, preferred refund method. |
| **System action** | Verifies the referenced purchase and item against TigerSteps order records, checks that required information is complete, and automatically applies the return rules. Assigns a unique return request ID and status, evaluates the request as Approved or Rejected, records a decision reason where applicable, and saves timestamps and status history. |
| **Outcome** | Approved or Rejected. An approved request proceeds to the next step of the return process. A rejected request does not proceed, and the customer is shown the reason. Either way the customer can view the current status. |

The rules that drive the decision are listed in [Business Rules](#business-rules), and the statuses a request moves through are listed in [Transaction States](#transaction-states).

**Official record.** Every return request stores the following fields, which together form the auditable record of the transaction: return request ID, customer ID, order ID or referenced purchase, item being returned, return quantity, return reason, reported item condition, current status, decision (Approved or Rejected), decision reason, submitted timestamp, decision timestamp, and status and decision history.

---

## 3. Who Is on the Team?

| Member | Role and responsibility |
|---|---|
| **Brieana Dinh** | Team leader. Final quality and integration approval, setting up meetings and deadlines. |
| **Danna Z. Gonzalez** | Business Problem, Main Transaction, and Scope |
| **Samantha Abi-Ranched** | Stakeholders and Requirements |
| **Justin Vu** | Business Rules and Transaction States |
| **Nhu Tran** | Team Charter and GitHub setup |

---

## 4. What Is in Scope?

### In Scope

The system handles the submission of a single online footwear return request for a previous purchase. It identifies the original order and the item being returned, and captures the required return information: quantity, return reason, reported item condition, and preferred refund method. It verifies that the returned item and quantity match the referenced purchase, then evaluates the request automatically against TigerSteps' standard return rules, approving an eligible request or rejecting an ineligible one with a stated reason. Each request receives a unique return request ID and a current status the customer can view, and the system stores key timestamps and status and decision history so the request can be tracked and reviewed later.

### Out of Scope

Exchanges and replacement orders, warranty claims and defective-product investigations, and shipping-carrier operations including physical transport and package tracking are all excluded. So is anything that happens after the shoes arrive at a TigerSteps facility: physical inspection, warehouse restocking, and inventory disposition. The actual financial refund is also out of scope. This transaction captures the customer's preferred refund method, but execution through a bank, card issuer, or payment processor happens later. Finally, the system does not create or manage customer accounts, and it does not manage the full lifecycle of the original customer order.

---

## 5. Where Are the Project Documents?

All Milestone 1 documents live in the `/docs` folder of this repository.

| Document | Contents | Owner |
|---|---|---|
| `TigerSteps_business-problem.docx` | Business problem, why it matters, in-scope and out-of-scope boundaries | Danna Z. Gonzalez |
| `TigerSteps_main-transaction.docx` | Transaction event, trigger, inputs, system action, outcome, official record | Danna Z. Gonzalez |
| `TigerSteps_stakeholders.docx` | Four stakeholder groups and their needs | Samantha Abi-Ranched |
| `TigerSteps_requirements.docx` | Seven functional and five non-functional requirements | Samantha Abi-Ranched |
| `TigerSteps_Business_Rules_States.docx` | Seven business rules (BR-1 to BR-7) and six transaction states | Justin Vu |
| `TigerSteps_team-charter.docx` | Team charter, meeting cadence, working agreements | Nhu Tran |

This README summarizes all of them. When the source documents and this README disagree, the source documents are authoritative until the README is updated.

---

## 6. How Do We Run and Use the Application?

**Current status: Milestone 1 is project definition only. No application code exists yet.** The sections below describe how the finished application is intended to be used, and will be replaced with real setup steps as the build progresses.

### Intended user flow

A customer opens the return request page and enters their customer ID, the order number, and the item they want to return, along with the quantity, a return reason, the reported condition of the item, and their preferred refund method. When they submit, the form validates that every required field is present and correctly formatted, and flags any field that needs correcting.

Once validation passes, the system assigns a unique return request ID and records the request as Submitted. It then verifies the order against TigerSteps records and evaluates the request against the business rules in the table below. The customer immediately sees either an approval or a rejection with the specific reason, and can return to a status page at any time to check the current state of their request.

### Planned setup (to be completed in later milestones)

```
# Clone the repository
git clone <repository-url>
cd tigersteps

# Open the application
# (local file, local server, or hosted URL — to be determined)
```

| Item | Status |
|---|---|
| Technology stack | To be decided |
| Hosting / deployment | To be decided |
| Sample test data | To be created (fictional data only, per NFR-5) |
| Setup and run instructions | To be added when the application is built |

---
