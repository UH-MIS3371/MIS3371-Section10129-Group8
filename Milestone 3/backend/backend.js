"use strict";

// ============================================================
// TigerSteps | MIS 3371 | Backend business rules
//
// This file is the AUTHORITY for every return decision. It runs in Node.js,
// never in the customer's browser, so the customer cannot read or change it.
// The browser (src/app.js) may repeat some checks to help the customer,
// but only this file decides Approved or Rejected.
//
// No DOM, no Express, no AWS code in here. server.js (Week 9) and the Lambda
// handler (Week 10) only pass a request in and send this result back.
// ============================================================

// ------------------------------------------------------------
// Fictional order records (NFR-5: no real customer data).
// Week 11 replaces this list with DynamoDB.
// ------------------------------------------------------------

// "Today" always means the calendar date at the store in Houston, so the
// 60-day window (BR-1) gives the same answer on a laptop and on AWS Lambda,
// which runs on UTC time.
const STORE_TIME_ZONE = 'America/Chicago';

// The store's calendar date for a moment in time, as YYYY-MM-DD.
// en-CA formats dates as YYYY-MM-DD.
function storeDateISO(now) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: STORE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now);
}

// Builds YYYY-MM-DD dates relative to the store's today so the 60-day tests
// keep working. now exists only so tests can pick the moment.
function dateDaysAgo(days, now = new Date()) {
    const [year, month, day] = storeDateISO(now).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

// deliveredDaysAgo: how many days before the decision day the item arrived.
// The real deliveryDate is worked out on every lookup (see findOrderRecords),
// so "day 60" stays day 60 even if the server or a Lambda instance keeps
// running past midnight. Week 11 replaces this list with stored dates.
const ORDER_ITEMS = [
    // Regular price, inside the window. These two can be approved.
    {
        customerId: 'C1001', orderId: 'ORD-1001', sku: 'TS-1001', name: 'Runner (Black)',
        quantityPurchased: 2, quantityPreviouslyReturned: 0, deliveredDaysAgo: 59,
        finalSale: false, clearance: false, existingReturnRequest: null
    },
    {
        customerId: 'C1001', orderId: 'ORD-1001', sku: 'TS-1002', name: 'Trail Boot (Brown)',
        quantityPurchased: 1, quantityPreviouslyReturned: 0, deliveredDaysAgo: 59,
        finalSale: false, clearance: false, existingReturnRequest: null
    },
    // Day 61 after delivery. BR-1 rejects this one.
    {
        customerId: 'C1002', orderId: 'ORD-1002', sku: 'TS-1003', name: 'Campus Low (White)',
        quantityPurchased: 3, quantityPreviouslyReturned: 1, deliveredDaysAgo: 61,
        finalSale: false, clearance: false, existingReturnRequest: null
    },
    // Final sale. BR-4 rejects this one.
    {
        customerId: 'C1003', orderId: 'ORD-1003', sku: 'TS-2001', name: 'Court Classic (final sale)',
        quantityPurchased: 1, quantityPreviouslyReturned: 0, deliveredDaysAgo: 10,
        finalSale: true, clearance: false, existingReturnRequest: null
    },
    // An order holding one final-sale item and one returnable item.
    {
        customerId: 'C1004', orderId: 'ORD-1004', sku: 'TS-2002', name: 'Summer Slide (final sale)',
        quantityPurchased: 2, quantityPreviouslyReturned: 0, deliveredDaysAgo: 5,
        finalSale: true, clearance: false, existingReturnRequest: null
    },
    {
        customerId: 'C1004', orderId: 'ORD-1004', sku: 'TS-1001', name: 'Runner (Black)',
        quantityPurchased: 1, quantityPreviouslyReturned: 0, deliveredDaysAgo: 5,
        finalSale: false, clearance: false, existingReturnRequest: null
    },
    // Clearance price. BR-4 rejects this one.
    {
        customerId: 'C1005', orderId: 'ORD-1005', sku: 'TS-3001', name: 'Retro Trainer (clearance)',
        quantityPurchased: 4, quantityPreviouslyReturned: 0, deliveredDaysAgo: 7,
        finalSale: false, clearance: true, existingReturnRequest: null
    },
    // Everything was returned already. BR-3 leaves no eligible quantity.
    {
        customerId: 'C1006', orderId: 'ORD-1006', sku: 'TS-1001', name: 'Runner (Black)',
        quantityPurchased: 2, quantityPreviouslyReturned: 2, deliveredDaysAgo: 3,
        finalSale: false, clearance: false, existingReturnRequest: null
    },
    // A request is already open for this item. BR-5 rejects a second one.
    {
        customerId: 'C1007', orderId: 'ORD-1007', sku: 'TS-1002', name: 'Trail Boot (Brown)',
        quantityPurchased: 1, quantityPreviouslyReturned: 0, deliveredDaysAgo: 2,
        finalSale: false, clearance: false,
        existingReturnRequest: { requestId: 'RR-DEMO-1007', status: 'Submitted' }
    },
    // Day 60 exactly. BR-1 still allows this one.
    {
        customerId: 'C1008', orderId: 'ORD-1008', sku: 'TS-1003', name: 'Campus Low (White)',
        quantityPurchased: 2, quantityPreviouslyReturned: 0, deliveredDaysAgo: 60,
        finalSale: false, clearance: false, existingReturnRequest: null
    }
];

// The only values the form may send for these two fields.
const ITEM_CONDITIONS = ['unworn', 'worn', 'damaged'];
const REFUND_METHODS = ['original-payment', 'store-credit'];

// How many days after delivery a return is still accepted (BR-1).
const RETURN_WINDOW_DAYS = 60;

// The BR-4 message, shared by the lookup preview and the decision.
const FINAL_SALE_MESSAGE = 'Final-sale and clearance items cannot be returned.';

// Items approved while this server is running, so BR-5 can block a second
// request. It resets when the server restarts. Week 11 stores this in DynamoDB.
const approvedItemKeys = new Set();

// ------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------

// Removes outside spaces and ignores upper/lower case.
function normalize(value) {
    return String(value ?? '').trim().toUpperCase();
}

function sameText(first, second) {
    return normalize(first) === normalize(second);
}

// One key per order item, used by BR-5 to spot a repeat request.
function itemKey(customerId, orderId, sku) {
    return [customerId, orderId, sku].map(normalize).join('|');
}

// Turns YYYY-MM-DD into a whole number of days, or null if it is not a real date.
function toDayNumber(dateText) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText))) {
        return null;
    }

    const [year, month, day] = String(dateText).split('-').map(Number);
    const stamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(stamp);
    if (parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day) {
        return null;
    }

    return stamp / 86400000;
}

// Today's date from the SERVER clock, as a store (Houston) date.
// Never take "today" from the customer.
function currentDateISO(now = new Date()) {
    return dateDaysAgo(0, now);
}

// ------------------------------------------------------------
// BR-1 to BR-5: one function per rule
// ------------------------------------------------------------

// BR-1: allowed through day 60 after delivery. Day 61 is not.
// Returns true when the window is closed.
function isReturnWindowExpired(deliveryDate, todayDate) {
    const delivered = toDayNumber(deliveryDate);
    const today = toDayNumber(todayDate);

    if (delivered === null || today === null) {
        return true;
    }

    const daysSinceDelivery = today - delivered;
    return daysSinceDelivery < 0 || daysSinceDelivery > RETURN_WINDOW_DAYS;
}

// The date a number of days before a YYYY-MM-DD date. '' if the date is not real.
function daysBefore(dateText, days) {
    const dayNumber = toDayNumber(dateText);
    if (dayNumber === null) {
        return '';
    }
    return new Date((dayNumber - days) * 86400000).toISOString().slice(0, 10);
}

// BR-2 (lookup): the full records on one customer's order. Internal only,
// because these records include flags the customer should not see.
// Each record is a copy with deliveryDate counted back from todayDate.
function findOrderRecords(customerId, orderId, todayDate = currentDateISO()) {
    if (!normalize(customerId) || !normalize(orderId)) {
        return [];
    }

    return ORDER_ITEMS
        .filter(item => sameText(item.customerId, customerId) && sameText(item.orderId, orderId))
        .map(({ deliveredDaysAgo, ...item }) => ({ ...item, deliveryDate: daysBefore(todayDate, deliveredDaysAgo) }));
}

// BR-2: Customer ID, Order ID, and item code must match one order record.
function findOrderItem(customerId, orderId, sku, todayDate = currentDateISO()) {
    if (!normalize(sku)) {
        return null;
    }

    return findOrderRecords(customerId, orderId, todayDate).find(item => sameText(item.sku, sku)) || null;
}

// BR-3: units still allowed back = units bought minus units already returned.
function remainingQuantity(orderItem) {
    return Number(orderItem.quantityPurchased) - Number(orderItem.quantityPreviouslyReturned);
}

// BR-3: the quantity must be a positive whole number inside the remaining balance.
function checkReturnQuantity(quantityPurchased, quantityPreviouslyReturned, returnQuantity) {
    const purchased = Number(quantityPurchased);
    const alreadyReturned = Number(quantityPreviouslyReturned);
    const requested = Number(returnQuantity);
    const remaining = remainingQuantity({ quantityPurchased: purchased, quantityPreviouslyReturned: alreadyReturned });

    if (!Number.isInteger(purchased) || !Number.isInteger(alreadyReturned)
        || purchased < 1 || alreadyReturned < 0 || alreadyReturned > purchased) {
        return { isValid: false, remaining: 0, message: 'The order quantity information is invalid.' };
    }

    if (String(returnQuantity ?? '').trim() === '' || !Number.isInteger(requested) || requested < 1) {
        return { isValid: false, remaining, message: 'Enter a positive whole number to return.' };
    }

    if (remaining < 1) {
        return { isValid: false, remaining, message: 'No quantity remains eligible for return.' };
    }

    if (requested > remaining) {
        return { isValid: false, remaining, message: 'You can return at most ' + remaining + ' of these.' };
    }

    return { isValid: true, remaining, message: requested + ' of ' + remaining + ' eligible.' };
}

// BR-4: final-sale and clearance items cannot be returned.
function isFinalSale(orderItem) {
    return Boolean(orderItem) && (orderItem.finalSale === true || orderItem.clearance === true);
}

// BR-5: only one active request per customer, order, and item.
function hasActiveRequest(orderItem, blockedKeys) {
    if (!orderItem) {
        return false;
    }

    const keys = blockedKeys instanceof Set ? blockedKeys : new Set();
    return Boolean(orderItem.existingReturnRequest)
        || keys.has(itemKey(orderItem.customerId, orderItem.orderId, orderItem.sku));
}

// True when a field was left out or sent empty.
function isMissing(value) {
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

// A text field must be a JSON string. A number, list, or object is malformed
// input. It is reported, never converted into text.
function checkTextField(value, requiredMessage, label, problems) {
    if (isMissing(value)) {
        problems.push(requiredMessage);
    } else if (typeof value !== 'string') {
        problems.push(label + ' must be text.');
    }
}

// Missing or malformed input is a validation problem, not a rule rejection.
// Types follow the data contract exactly: text fields are strings and
// returnQuantity is a JSON number with no decimals (1, not "1", true, or [1]).
// Whether the number is inside the allowed range is BR-3, not validation.
function collectValidationErrors(transaction) {
    const problems = [];

    checkTextField(transaction.customerId, 'Customer ID is required.', 'Customer ID', problems);
    checkTextField(transaction.orderId, 'Order ID is required.', 'Order ID', problems);
    checkTextField(transaction.sku, 'Choose the item you are returning.', 'Item code', problems);

    if (isMissing(transaction.returnQuantity)) {
        problems.push('Quantity to return is required.');
    } else if (typeof transaction.returnQuantity !== 'number' || !Number.isInteger(transaction.returnQuantity)) {
        problems.push('Quantity to return must be a whole number.');
    }

    checkTextField(transaction.reason, 'A reason for the return is required.', 'The reason', problems);
    if (typeof transaction.reason === 'string' && transaction.reason.trim().length > 250) {
        problems.push('The reason must be 250 characters or fewer.');
    }
    if (!ITEM_CONDITIONS.includes(transaction.reportedCondition)) {
        problems.push('Choose the item condition.');
    }
    if (!REFUND_METHODS.includes(transaction.preferredRefundMethod)) {
        problems.push('Choose a preferred refund method.');
    }

    return problems;
}

// ------------------------------------------------------------
// BR-6: the decision. Collects every failed rule, not only the first.
// ------------------------------------------------------------
function decideReturnRequest(transaction, blockedKeys, todayDate) {
    const reasons = [];
    const orderItem = findOrderItem(transaction.customerId, transaction.orderId, transaction.sku, todayDate);

    if (!orderItem) {
        // BR-2 failed, so there is no trusted record to test the other rules against.
        reasons.push({ rule: 'BR-2', message: 'Customer ID, Order ID, and item must match one purchased order item.' });
        return { status: 'Rejected', reasons, orderItem: null };
    }

    if (isReturnWindowExpired(orderItem.deliveryDate, todayDate)) {
        reasons.push({ rule: 'BR-1', message: 'The return window is limited to ' + RETURN_WINDOW_DAYS + ' days after delivery.' });
    }

    const quantityResult = checkReturnQuantity(
        orderItem.quantityPurchased,
        orderItem.quantityPreviouslyReturned,
        transaction.returnQuantity
    );
    if (!quantityResult.isValid) {
        reasons.push({ rule: 'BR-3', message: quantityResult.message });
    }

    if (isFinalSale(orderItem)) {
        reasons.push({ rule: 'BR-4', message: FINAL_SALE_MESSAGE });
    }

    if (hasActiveRequest(orderItem, blockedKeys)) {
        reasons.push({ rule: 'BR-5', message: 'A return request is already active for this order item.' });
    }

    return { status: reasons.length === 0 ? 'Approved' : 'Rejected', reasons, orderItem };
}

// ------------------------------------------------------------
// Entry points used by server.js (Week 9) and Lambda (Week 10)
// ------------------------------------------------------------

// GET /api/orders: only the items on THIS customer's order, and only the
// fields the form needs. The raw finalSale and clearance flags and other
// customers' orders never leave the server. "returnable" is a preview for the
// form only (BR-4). processReturnRequest() still decides on submit.
function findOrderItems(customerId, orderId, todayDate = currentDateISO()) {
    return findOrderRecords(customerId, orderId, todayDate).map(item => ({
        sku: item.sku,
        name: item.name,
        quantityPurchased: item.quantityPurchased,
        quantityPreviouslyReturned: item.quantityPreviouslyReturned,
        remainingEligibleQuantity: remainingQuantity(item),
        deliveryDate: item.deliveryDate,
        returnable: !isFinalSale(item),
        returnableMessage: isFinalSale(item) ? FINAL_SALE_MESSAGE : ''
    }));
}

// Demo ID only. Week 11 creates the real Return ID when the record is saved.
let demoSequence = 0;
function createDemoReturnId() {
    demoSequence += 1;
    return 'RR-DEMO-' + Date.now() + '-' + demoSequence;
}

// POST /api/returns: validate, apply BR-1 to BR-5, decide (BR-6), and report
// the status sequence (BR-7: Submitted, then Approved or Rejected).
// todayDate and blockedKeys exist only so tests can control them.
function processReturnRequest(transaction, todayDate = currentDateISO(), blockedKeys = approvedItemKeys) {
    if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) {
        return { success: false, error: 'Validation', problems: ['A return request object is required.'], message: 'A return request object is required.' };
    }

    // Validation first. A validation error never becomes a Rejected decision.
    const problems = collectValidationErrors(transaction);
    if (problems.length > 0) {
        return { success: false, error: 'Validation', problems, message: problems.join(' ') };
    }

    const submittedAt = new Date().toISOString();
    const result = decideReturnRequest(transaction, blockedKeys, todayDate);
    const decidedAt = new Date().toISOString();

    if (result.status === 'Approved') {
        // BR-5: this item now has an active request.
        blockedKeys.add(itemKey(transaction.customerId, transaction.orderId, transaction.sku));
        return {
            success: true,
            status: 'Approved',
            message: 'Approved. All return rules passed.',
            reasons: [],
            returnId: createDemoReturnId(),
            remainingEligibleQuantity: remainingQuantity(result.orderItem),
            statusHistory: [{ status: 'Submitted', changedAt: submittedAt }, { status: 'Approved', changedAt: decidedAt }],
            submittedAt,
            decidedAt,
            persisted: false
        };
    }

    return {
        success: false,
        status: 'Rejected',
        rule: result.reasons[0].rule,
        reasons: result.reasons,
        message: 'Rejected. ' + result.reasons.map(reason => reason.rule + ': ' + reason.message).join(' '),
        statusHistory: [{ status: 'Submitted', changedAt: submittedAt }, { status: 'Rejected', changedAt: decidedAt }],
        submittedAt,
        decidedAt,
        persisted: false
    };
}

module.exports = {
    // used by server.js
    processReturnRequest,
    findOrderItems,
    // exported for tests
    dateDaysAgo,
    currentDateISO,
    itemKey,
    isReturnWindowExpired,
    findOrderItem,
    remainingQuantity,
    checkReturnQuantity,
    isFinalSale,
    hasActiveRequest,
    collectValidationErrors,
    decideReturnRequest
};
