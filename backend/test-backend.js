
"use strict";

// TigerSteps | MIS 3371 | Week 8 local backend test cases
// Run from the repository root: node backend/test-backend.js
// Tests backend.js independently of HTML, CSS, and browser JavaScript.

const { processReturnRequest } = require("./backend.js");

// Simulate a date one day after today for the 61-day boundary test.
function tomorrowISO() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 1);

    return date.getFullYear() + "-"
        + String(date.getMonth() + 1).padStart(2, "0") + "-"
        + String(date.getDate()).padStart(2, "0");
}

// Common required fields for a return transaction.
const validRequest = {
    customerId: "C1001",
    orderId: "ORD-1001",
    sku: "TS-1001",
    returnQuantity: 1,
    reason: "Wrong size",
    reportedCondition: "unworn",
    preferredRefundMethod: "original_payment"
};

// 2 valid, 2 invalid, and 2 boundary/edge cases.
const tests = [
    {
        category: "Valid",
        name: "Regular item, 59 days after delivery, quantity 1",
        transaction: { ...validRequest },
        expected: { success: true, status: "Approved" }
    },
    {
        category: "Valid",
        name: "Second purchased SKU on the same verified order",
        transaction: { ...validRequest, sku: "TS-1002" },
        expected: { success: true, status: "Approved" }
    },
    {
        category: "Invalid",
        name: "BR-2: Customer ID does not match the order",
        transaction: { ...validRequest, customerId: "C9999" },
        expected: {
            success: false,
            status: "Rejected",
            rule: "BR-2"
        }
    },
    {
        category: "Invalid",
        name: "BR-3: Return quantity 3 exceeds 2 purchased",
        transaction: { ...validRequest, returnQuantity: 3 },
        expected: {
            success: false,
            status: "Rejected",
            rule: "BR-3"
        }
    },
    {
        category: "Boundary",
        name: "BR-1: Exactly 60 days; BR-3: Exactly 2 available",
        transaction: {
            ...validRequest,
            customerId: "C1008",
            orderId: "ORD-1008",
            sku: "TS-1007",
            returnQuantity: 2
        },
        expected: { success: true, status: "Approved" }
    },
    {
        category: "Boundary",
        name: "BR-1: 61 days after delivery",
        transaction: {
            ...validRequest,
            customerId: "C1008",
            orderId: "ORD-1008",
            sku: "TS-1007"
        },
        todayDate: tomorrowISO(),
        expected: {
            success: false,
            status: "Rejected",
            rule: "BR-1"
        }
    }
];

let passedCount = 0;

for (const [index, test] of tests.entries()) {
    const actual = test.todayDate
        ? processReturnRequest(test.transaction, test.todayDate)
        : processReturnRequest(test.transaction);

    const passed =
        actual.success === test.expected.success &&
        actual.status === test.expected.status &&
        (
            test.expected.rule === undefined ||
            actual.rule === test.expected.rule
        );

    if (passed) {
        passedCount++;
    }

    console.log(
        `\nTest ${index + 1} | ${test.category} | ${test.name}`
    );
    console.log(
        `Expected: ${test.expected.status}`
    );
    console.log(
        `Actual: ${actual.status}`
    );
    console.log(
        `Message: ${actual.message}`
    );
    console.log(
        `Outcome: ${passed ? "PASS" : "FAIL"}`
    );
}

console.log(
    `\nTigerSteps Week 8 results: ${passedCount}/${tests.length} tests passed.`
);

if (passedCount !== tests.length) {
    process.exitCode = 1;
}
