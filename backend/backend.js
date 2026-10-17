
"use strict";

// TigerSteps | MIS 3371 | Week 8 local backend checkpoint
// This file runs in Node.js. It does NOT access the HTML/DOM or use an API/database.
// Week 8 business rules implemented: BR-1 (60 days), BR-2 (purchase match),
// and BR-3 (remaining return quantity). Additional TigerSteps rules will be
// enforced in later backend work; the completed Milestone 2 frontend is unchanged.

// Build fictional delivery dates relative to today, like the M2 frontend demo.
function dateDaysAgo(days) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return date.getFullYear() + '-'
        + String(date.getMonth() + 1).padStart(2, '0') + '-'
        + String(date.getDate()).padStart(2, '0');
}

function todayISO() {
    return dateDaysAgo(0);
}

// Mock purchase records, kept on the backend side rather than trusting form data.
// These regular-price examples match corresponding M2 frontend records.
// Other M2 cases (final sale / duplicates) are outside this Week 8 rule subset.
const ORDER_ITEM_RECORDS = [
    {
        customerId: 'C1001', orderId: 'ORD-1001', sku: 'TS-1001',
        quantityPurchased: 2, quantityPreviouslyReturned: 0,
        deliveryDate: dateDaysAgo(59)
    },
    {
        customerId: 'C1001', orderId: 'ORD-1001', sku: 'TS-1002',
        quantityPurchased: 1, quantityPreviouslyReturned: 0,
        deliveryDate: dateDaysAgo(59)
    },
    {
        customerId: 'C1005', orderId: 'ORD-1005', sku: 'TS-1004',
        quantityPurchased: 10, quantityPreviouslyReturned: 0,
        deliveryDate: dateDaysAgo(76)
    },
    {
        customerId: 'C1007', orderId: 'ORD-1007', sku: 'TS-1006',
        quantityPurchased: 1, quantityPreviouslyReturned: 1,
        deliveryDate: dateDaysAgo(5)
    },
    {
        customerId: 'C1008', orderId: 'ORD-1008', sku: 'TS-1007',
        quantityPurchased: 2, quantityPreviouslyReturned: 0,
        deliveryDate: dateDaysAgo(60)
    }
];

function normalize(value) {
    return String(value ?? '').trim().toUpperCase();
}

function reject(rule, message) {
    return { success: false, status: 'Rejected', rule, message };
}

// Parse a calendar date reliably; invalid dates (such as Feb 30) return null.
function dateAsUTC(isoDate) {
    if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        return null;
    }

    const [year, month, day] = isoDate.split('-').map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);

    if (parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day) {
        return null;
    }

    return timestamp;
}

// Input: ONE plain transaction object, not HTML inputs or DOM elements.
// todayDate is optional and used by the local tests to simulate boundary dates;
// in a real backend it must come from the server, never a customer-submitted field.
function processReturnRequest(transaction, todayDate = todayISO()) {
    // Step 1: validate the required return-request information.
    if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) {
        return reject('Validation', 'A return request object is required.');
    }

    const customerId = normalize(transaction.customerId);
    const orderId = normalize(transaction.orderId);
    const sku = normalize(transaction.sku);
    const reason = String(transaction.reason ?? '').trim();
    const reportedCondition = String(transaction.reportedCondition ?? '').trim();
    const preferredRefundMethod = String(transaction.preferredRefundMethod ?? '').trim();

    if (!customerId || !orderId || !sku) {
        return reject('Validation', 'Customer ID, Order ID, and item SKU are required.');
    }
    if (!reason || !reportedCondition || !preferredRefundMethod) {
        return reject('Validation', 'Return reason, item condition, and preferred refund method are required.');
    }

    // BR-2: Independently verify that this SKU belongs to this customer's order.
    const orderItem = ORDER_ITEM_RECORDS.find(record =>
        normalize(record.customerId) === customerId
        && normalize(record.orderId) === orderId
        && normalize(record.sku) === sku
    );
    if (!orderItem) {
        return reject('BR-2', 'The customer, order, and item do not match a purchase record.');
    }

    // BR-1: Reject more than 60 calendar days after delivery; day 60 is allowed.
    const deliveredUTC = dateAsUTC(orderItem.deliveryDate);
    const todayUTC = dateAsUTC(todayDate);
    if (deliveredUTC === null || todayUTC === null) {
        return reject('BR-1', 'The order or current date is invalid.');
    }
    const daysSinceDelivery = Math.floor((todayUTC - deliveredUTC) / 86400000);
    if (daysSinceDelivery < 0) {
        return reject('BR-1', 'Delivery date cannot be in the future.');
    }
    if (daysSinceDelivery > 60) {
        return reject('BR-1', 'Return window expired: more than 60 days since delivery.');
    }

    // BR-3: Requested quantity must be a positive integer within unreturned units.
    const rawQuantity = transaction.returnQuantity;
    const requestedQuantity = Number(rawQuantity);
    if (rawQuantity === null || rawQuantity === undefined
        || String(rawQuantity).trim() === ''
        || !Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
        return reject('BR-3', 'Return quantity must be a positive whole number.');
    }

    const purchased = orderItem.quantityPurchased;
    const previouslyReturned = orderItem.quantityPreviouslyReturned;
    if (!Number.isInteger(purchased) || purchased < 1
        || !Number.isInteger(previouslyReturned) || previouslyReturned < 0
        || previouslyReturned > purchased) {
        return reject('BR-3', 'Stored order quantity information is invalid.');
    }

    const remaining = purchased - previouslyReturned;
    if (requestedQuantity > remaining) {
        return reject('BR-3', 'Return quantity exceeds the ' + remaining + ' item(s) remaining eligible for return.');
    }

    // Step 4: return one structured decision (no permanent storage in Week 8).
    return {
        success: true,
        status: 'Approved',
        message: 'The return request passed the Week 8 backend rules.',
        remainingEligibleQuantity: remaining
    };
}

// Allows test-backend.js to import the function without executing browser code.
module.exports = { processReturnRequest };
