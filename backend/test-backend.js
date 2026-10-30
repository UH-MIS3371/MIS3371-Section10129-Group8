"use strict";

// TigerSteps | Backend unit tests for BR-1 to BR-7.
// Run from the repository root with either command:
//   node backend/test-backend.js
//   node --test backend/
// Uses the test tools built into Node.js, so nothing needs to be installed.

const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('./backend.js');

const {
    dateDaysAgo, itemKey, isReturnWindowExpired, findOrderItem, findOrderItems,
    remainingQuantity, checkReturnQuantity, isFinalSale, hasActiveRequest,
    collectValidationErrors, decideReturnRequest, processReturnRequest
} = rules;

const today = dateDaysAgo(0);

// A complete request, so only the rule under test can fail.
function requestFor(customerId, orderId, sku, quantity) {
    return {
        customerId, orderId, sku,
        returnQuantity: quantity,
        reason: 'Does not fit',
        reportedCondition: 'unworn',
        preferredRefundMethod: 'store-credit'
    };
}

function rulesFailedFor(customerId, orderId, sku, quantity) {
    return decideReturnRequest(requestFor(customerId, orderId, sku, quantity), new Set(), today)
        .reasons.map(reason => reason.rule).join(',');
}

test('BR-1 return window (true means closed)', () => {
    assert.equal(isReturnWindowExpired('', today), true, 'blank delivery date');
    assert.equal(isReturnWindowExpired('2026-13-45', today), true, 'not a real date');
    assert.equal(isReturnWindowExpired(dateDaysAgo(59), today), false, '59 days');
    assert.equal(isReturnWindowExpired(dateDaysAgo(60), today), false, '60 days is still allowed');
    assert.equal(isReturnWindowExpired(dateDaysAgo(61), today), true, '61 days');
    assert.equal(isReturnWindowExpired(dateDaysAgo(-1), today), true, 'delivery in the future');
});

test('BR-1 uses the store date in Houston, not the machine time zone', () => {
    // 9 pm in Houston on Oct 28 is already 02:00 on Oct 29 in UTC (Lambda's clock).
    const ninePmHouston = new Date('2026-10-29T02:00:00Z');
    assert.equal(rules.currentDateISO(ninePmHouston), '2026-10-28', 'still Oct 28 at the store');
    assert.equal(rules.currentDateISO(new Date('2026-10-29T06:00:00Z')), '2026-10-29', '1 am Houston is the next day');
    assert.equal(dateDaysAgo(1, new Date('2026-03-01T18:00:00Z')), '2026-02-28', 'month wraps correctly');

    // The 60/61 boundary is measured from the Houston date at 9 pm.
    const storeToday = rules.currentDateISO(ninePmHouston);
    assert.equal(isReturnWindowExpired(dateDaysAgo(60, ninePmHouston), storeToday), false, 'day 60 at 9 pm');
    assert.equal(isReturnWindowExpired(dateDaysAgo(61, ninePmHouston), storeToday), true, 'day 61 at 9 pm');
});

test('BR-2 purchase verification', () => {
    assert.notEqual(findOrderItem('C1001', 'ORD-1001', 'TS-1001'), null, 'exact match');
    assert.notEqual(findOrderItem('c1001', 'ord-1001', 'ts-1001'), null, 'lower case');
    assert.notEqual(findOrderItem(' C1001 ', ' ORD-1001', 'TS-1001 '), null, 'extra spaces');
    assert.equal(findOrderItem('C1002', 'ORD-1001', 'TS-1001'), null, 'right order, wrong customer');
    assert.equal(findOrderItem('C1001', 'ORD-1001', 'TS-3001'), null, 'item not on that order');
    assert.equal(findOrderItem('C1001', 'ORD-1001', ''), null, 'blank item code');
});

test('BR-2 lookup returns only this order, with safe fields only', () => {
    const items = findOrderItems('C1004', 'ORD-1004');
    assert.deepEqual(items.map(item => item.sku).sort(), ['TS-1001', 'TS-2002']);
    assert.equal(findOrderItems('C9999', 'ORD-9999').length, 0, 'unknown order');
    assert.equal(findOrderItems('C1001', 'ORD-1002').length, 0, 'customer and order do not match');
    for (const item of items) {
        assert.equal('finalSale' in item, false, 'final-sale flag stays on the server');
        assert.equal('clearance' in item, false, 'clearance flag stays on the server');
        assert.equal('existingReturnRequest' in item, false, 'open requests stay on the server');
        assert.equal('customerId' in item, false, 'no customer data sent back');
    }

    // BR-4 preview: the form learns only "returnable" and a message.
    const bySku = Object.fromEntries(items.map(item => [item.sku, item]));
    assert.equal(bySku['TS-1001'].returnable, true, 'regular item');
    assert.equal(bySku['TS-1001'].returnableMessage, '');
    assert.equal(bySku['TS-2002'].returnable, false, 'final-sale item');
    assert.match(bySku['TS-2002'].returnableMessage, /cannot be returned/);
    assert.equal(findOrderItems('C1005', 'ORD-1005')[0].returnable, false, 'clearance item');
});

test('BR-3 return quantity', () => {
    assert.equal(checkReturnQuantity(2, 0, 1).isValid, true, '1 of 2');
    assert.equal(checkReturnQuantity(2, 0, 2).isValid, true, '2 of 2 (boundary)');
    assert.equal(checkReturnQuantity(2, 0, 3).isValid, false, '3 of 2');
    assert.equal(checkReturnQuantity(2, 0, 0).isValid, false, 'zero');
    assert.equal(checkReturnQuantity(2, 0, 1.5).isValid, false, 'not a whole number');
    assert.equal(checkReturnQuantity(2, 0, '').isValid, false, 'blank');
    assert.equal(checkReturnQuantity(2, 2, 1).isValid, false, 'everything already returned');
    assert.equal(remainingQuantity(findOrderItem('C1002', 'ORD-1002', 'TS-1003')), 2, 'bought 3, returned 1');
    assert.equal(remainingQuantity(findOrderItem('C1006', 'ORD-1006', 'TS-1001')), 0, 'bought 2, returned 2');
});

test('BR-4 final sale and clearance', () => {
    assert.equal(isFinalSale(findOrderItem('C1001', 'ORD-1001', 'TS-1001')), false, 'regular price');
    assert.equal(isFinalSale(findOrderItem('C1003', 'ORD-1003', 'TS-2001')), true, 'final sale');
    assert.equal(isFinalSale(findOrderItem('C1005', 'ORD-1005', 'TS-3001')), true, 'clearance');
});

test('BR-5 one active request per item', () => {
    const item = findOrderItem('C1001', 'ORD-1001', 'TS-1001');
    assert.equal(hasActiveRequest(item, new Set()), false, 'no request yet');
    assert.equal(hasActiveRequest(findOrderItem('C1007', 'ORD-1007', 'TS-1002'), new Set()), true, 'record already has one');
    assert.equal(hasActiveRequest(item, new Set([itemKey('C1001', 'ORD-1001', 'TS-1001')])), true, 'approved earlier');
    assert.equal(itemKey(' c1001', 'ord-1001 ', 'ts-1001'), 'C1001|ORD-1001|TS-1001', 'case and spaces do not make a new key');
});

test('BR-6 decision names every failed rule', () => {
    assert.equal(rulesFailedFor('C1001', 'ORD-1001', 'TS-1001', 1), '', 'regular item approved');
    assert.equal(rulesFailedFor('C1008', 'ORD-1008', 'TS-1003', 1), '', 'day 60 approved');
    assert.equal(rulesFailedFor('C1002', 'ORD-1002', 'TS-1003', 1), 'BR-1');
    assert.equal(rulesFailedFor('C9999', 'ORD-9999', 'TS-1001', 1), 'BR-2');
    assert.equal(rulesFailedFor('C1001', 'ORD-1001', 'TS-1001', 3), 'BR-3', 'more than purchased');
    assert.equal(rulesFailedFor('C1006', 'ORD-1006', 'TS-1001', 1), 'BR-3');
    assert.equal(rulesFailedFor('C1003', 'ORD-1003', 'TS-2001', 1), 'BR-4');
    assert.equal(rulesFailedFor('C1005', 'ORD-1005', 'TS-3001', 1), 'BR-4');
    assert.equal(rulesFailedFor('C1007', 'ORD-1007', 'TS-1002', 1), 'BR-5');
    assert.equal(rulesFailedFor('C1004', 'ORD-1004', 'TS-2002', 9), 'BR-3,BR-4', 'two rules at once');
});

test('Validation is not a rule rejection', () => {
    assert.equal(collectValidationErrors(requestFor('C1001', 'ORD-1001', 'TS-1001', 1)).length, 0);
    assert.equal(collectValidationErrors({ ...requestFor('C1001', 'ORD-1001', 'TS-1001', 1), preferredRefundMethod: 'original_payment' }).length, 1);
    assert.equal(collectValidationErrors({ ...requestFor('C1001', 'ORD-1001', 'TS-1001', 1), reason: '   ', reportedCondition: '' }).length, 2);

    const result = processReturnRequest({ ...requestFor('C1001', 'ORD-1001', 'TS-1001', 1), reason: '' }, today, new Set());
    assert.equal(result.error, 'Validation');
    assert.equal(result.status, undefined, 'no Approved/Rejected status for bad input');
    assert.equal(processReturnRequest(null, today, new Set()).error, 'Validation', 'missing object');
});

test('Validation: wrong data types are reported, never converted', () => {
    const good = requestFor('C1001', 'ORD-1001', 'TS-1001', 1);
    const problemsFor = change => collectValidationErrors({ ...good, ...change });

    assert.deepEqual(problemsFor({}), [], 'the contract types pass');
    assert.deepEqual(problemsFor({ returnQuantity: '1' }), ['Quantity to return must be a whole number.'], 'text "1" is not a number');
    assert.equal(problemsFor({ returnQuantity: true }).length, 1, 'true is not 1');
    assert.equal(problemsFor({ returnQuantity: [1] }).length, 1, '[1] is not 1');
    assert.equal(problemsFor({ returnQuantity: '0x1' }).length, 1, 'hex text is not 1');
    assert.equal(problemsFor({ returnQuantity: 1.5 }).length, 1, 'no decimals');
    assert.deepEqual(problemsFor({ returnQuantity: null }), ['Quantity to return is required.'], 'blank box from the form');
    assert.deepEqual(problemsFor({ reason: {} }), ['The reason must be text.'], 'an object is not text');
    assert.deepEqual(problemsFor({ customerId: ['C1001'] }), ['Customer ID must be text.'], 'a list is not text');
    assert.deepEqual(problemsFor({ sku: 1001 }), ['Item code must be text.'], 'a number is not text');

    // Inside the type rules, the range is still BR-3, not validation.
    assert.equal(processReturnRequest({ ...good, returnQuantity: 0 }, today, new Set()).rule, 'BR-3');
    assert.equal(processReturnRequest({ ...good, returnQuantity: true }, today, new Set()).error, 'Validation');
});

test('Sample delivery dates are counted from the decision day, not frozen at load time', () => {
    // C1008 arrived 60 days before the decision day, whatever that day is.
    assert.equal(findOrderItem('C1008', 'ORD-1008', 'TS-1003', '2026-12-31').deliveryDate, '2026-11-01');
    assert.equal(findOrderItems('C1008', 'ORD-1008', '2027-03-01')[0].deliveryDate, '2026-12-31');

    // A server still running tomorrow keeps the boundary: day 60 Approved, day 61 Rejected.
    const tomorrow = dateDaysAgo(-1);
    assert.equal(decideReturnRequest(requestFor('C1008', 'ORD-1008', 'TS-1003', 1), new Set(), tomorrow).status, 'Approved');
    assert.equal(decideReturnRequest(requestFor('C1002', 'ORD-1002', 'TS-1003', 1), new Set(), tomorrow).reasons[0].rule, 'BR-1');
});

test('processReturnRequest: Approved, then BR-5 blocks a repeat (BR-7 history)', () => {
    const session = new Set();
    const first = processReturnRequest(requestFor('C1001', 'ORD-1001', 'TS-1001', 1), today, session);
    assert.equal(first.status, 'Approved');
    assert.equal(first.persisted, false, 'nothing is saved before DynamoDB');
    assert.match(first.returnId, /^RR-DEMO-/);
    assert.deepEqual(first.statusHistory.map(step => step.status), ['Submitted', 'Approved']);

    const second = processReturnRequest(requestFor('C1001', 'ORD-1001', 'TS-1001', 1), today, session);
    assert.equal(second.status, 'Rejected');
    assert.equal(second.rule, 'BR-5');
    assert.deepEqual(second.statusHistory.map(step => step.status), ['Submitted', 'Rejected']);
});

test('The customer cannot send their own trusted values', () => {
    // Fake values in the request are ignored. The order record decides.
    const sneaky = { ...requestFor('C1003', 'ORD-1003', 'TS-2001', 1), finalSale: false, status: 'Approved', deliveryDate: today };
    const result = processReturnRequest(sneaky, today, new Set());
    assert.equal(result.status, 'Rejected');
    assert.equal(result.rule, 'BR-4');
});
