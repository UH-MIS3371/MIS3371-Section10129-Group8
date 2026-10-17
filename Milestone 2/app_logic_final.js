// TigerSteps - Product Return Request

// Builds dates relative to today so the sample records exercise the return-window boundaries.
function dateDaysAgo(days) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return date.getFullYear() + '-'
        + String(date.getMonth() + 1).padStart(2, '0') + '-'
        + String(date.getDate()).padStart(2, '0');
}

// Fictional order-item records for the client-side demonstration (includes BR-4 and BR-5 cases).
const ORDER_ITEM_RECORDS = [
    {
        customerId: 'C1001',
        orderId: 'ORD-1001',
        sku: 'TS-1001',
        quantityPurchased: 2,
        quantityPreviouslyReturned: 0,
        deliveryDate: dateDaysAgo(59),
        finalSale: false,
        clearance: false,
        existingReturnRequest: null
    },
    {
        customerId: 'C1001',
        orderId: 'ORD-1001',
        sku: 'TS-1002',
        quantityPurchased: 1,
        quantityPreviouslyReturned: 0,
        deliveryDate: dateDaysAgo(59),
        finalSale: false,
        clearance: false,
        existingReturnRequest: null
    },
    {
        customerId: 'C1002',
        orderId: 'ORD-1002',
        sku: 'TS-2001',
        quantityPurchased: 1,
        quantityPreviouslyReturned: 0,
        deliveryDate: dateDaysAgo(60),
        finalSale: true,
        clearance: false,
        existingReturnRequest: null
    },
    {
        customerId: 'C1003',
        orderId: 'ORD-1003',
        sku: 'TS-3001',
        quantityPurchased: 5,
        quantityPreviouslyReturned: 3,
        deliveryDate: dateDaysAgo(61),
        finalSale: false,
        clearance: true,
        existingReturnRequest: null
    },
    {
        customerId: 'C1004',
        orderId: 'ORD-1004',
        sku: 'TS-1003',
        quantityPurchased: 3,
        quantityPreviouslyReturned: 1,
        deliveryDate: dateDaysAgo(1),
        finalSale: true,
        clearance: true,
        existingReturnRequest: {
            requestId: 'RR-DEMO-1004', status: 'Submitted'
        }
    },
    {
        customerId: 'C1005',
        orderId: 'ORD-1005',
        sku: 'TS-1004',
        quantityPurchased: 10,
        quantityPreviouslyReturned: 0,
        deliveryDate: dateDaysAgo(76),
        finalSale: false,
        clearance: false,
        existingReturnRequest: null
    },
    {
        customerId: 'C1006',
        orderId: 'ORD-1006',
        sku: 'TS-1005',
        quantityPurchased: 1,
        quantityPreviouslyReturned: 0,
        deliveryDate: dateDaysAgo(99),
        finalSale: true,
        clearance: false,
        existingReturnRequest: null
    },
    {
        customerId: 'C1007',
        orderId: 'ORD-1007',
        sku: 'TS-1006',
        quantityPurchased: 1,
        quantityPreviouslyReturned: 1,
        deliveryDate: dateDaysAgo(5),
        finalSale: false,
        clearance: false,
        existingReturnRequest: null
    },
    // Regular-price order exactly at the allowed 60-day boundary (BR-1).
    {
        customerId: 'C1008',
        orderId: 'ORD-1008',
        sku: 'TS-1007',
        quantityPurchased: 2,
        quantityPreviouslyReturned: 0,
        deliveryDate: dateDaysAgo(60),
        finalSale: false,
        clearance: false,
        existingReturnRequest: null
    }
];

// Connects the page controls used by order lookup and return eligibility.
const returnForm = document.querySelector('#returnForm');
const customerIDInput = document.querySelector('#CustomerID');
const orderIDInput = document.querySelector('#orderID');
const findOrderButton = document.querySelector('#findOrderButton');
const lookupMessage = document.querySelector('#lookupMessage');
const itemInput = document.querySelector('#itemSKU');
const quantityPurchasedInput = document.querySelector('#quantityPurchased');
const returnQuantityInput = document.querySelector('#returnQuantity');
const descriptionInput = document.querySelector('#description');
const reportedConditionInput = document.querySelector('#reportedCondition');
const preferredRefundMethodInput = document.querySelector('#preferredRefundMethod');
const dayDeliveredInput = document.querySelector('#dayDelivered');
const orderSummary = document.querySelector('#orderSummary');
const quantityMessage = document.querySelector('#quantityMessage');
const submitReturnButton = document.querySelector('#submitReturnButton');
const messageOutput = document.querySelector('#returnMessage');
const formErrors = document.querySelector('#formErrors');

// Tracks the verified order, selected item, and duplicate submissions in this page session.
let matchedOrderItems = [];
let selectedOrderItem = null;
let lookupCustomerID = '';
let lookupOrderID = '';
const submittedRequestKeys = new Set();

// Shared helpers for customer/order matching and eligibility rules.
function normalized(value) {
    return value.trim().toUpperCase();
}

function requestKey(customerId, orderId, sku) {
    return JSON.stringify([
        normalized(customerId),
        normalized(orderId),
        normalized(sku)
    ]);
}

function currentDateISO() {
    const today = new Date();
    return today.getFullYear() + '-'
        + String(today.getMonth() + 1).padStart(2, '0') + '-'
        + String(today.getDate()).padStart(2, '0');
}

// BR-1: A return is eligible through exactly 60 calendar days after delivery.
function isReturnWindowExpired(deliveryDate, todayDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)
        || !/^\d{4}-\d{2}-\d{2}$/.test(todayDate)) {
        return true;
    }

    const [year, month, day] = deliveryDate.split('-').map(Number);
    const deliveredUTC = Date.UTC(year, month - 1, day);
    const delivered = new Date(deliveredUTC);
    if (delivered.getUTCFullYear() !== year
        || delivered.getUTCMonth() !== month - 1
        || delivered.getUTCDate() !== day) {
        return true;
    }

    const [todayYear, todayMonth, todayDay] = todayDate.split('-').map(Number);
    const todayUTC = Date.UTC(todayYear, todayMonth - 1, todayDay);
    const validToday = new Date(todayUTC);
    if (validToday.getUTCFullYear() !== todayYear
        || validToday.getUTCMonth() !== todayMonth - 1
        || validToday.getUTCDate() !== todayDay) {
        return true;
    }

    const daysSinceDelivery = Math.floor((todayUTC - deliveredUTC) / 86400000);
    return daysSinceDelivery < 0 || daysSinceDelivery > 60;
}

// BR-3: Requested quantity must be a positive whole number within the unreturned balance.
function checkReturnQuantity(quantityPurchased, quantityPreviouslyReturned, returnQuantity) {
    const purchased = Number(quantityPurchased);
    const previouslyReturned = Number(quantityPreviouslyReturned);
    const requested = Number(returnQuantity);
    const remaining = purchased - previouslyReturned;

    if (returnQuantity === '' || !Number.isInteger(requested) || requested < 1) {
        return { isValid: false, remaining, message: 'Enter a positive whole-number quantity to return.' };
    }
    if (!Number.isInteger(purchased) || !Number.isInteger(previouslyReturned)
        || purchased < 1 || previouslyReturned < 0 || previouslyReturned > purchased) {
        return { isValid: false, remaining, message: 'The order quantity information is invalid.' };
    }
    if (remaining < 1) {
        return { isValid: false, remaining, message: 'No quantity remains eligible for return.' };
    }
    if (requested > remaining) {
        return {
            isValid: false,
            remaining,
            message: 'Return quantity cannot exceed the ' + remaining + ' eligible item(s) remaining.'
        };
    }

    return { isValid: true, remaining, message: 'Return quantity is within the eligible limit.' };
}

// Evaluates a plain transaction object without reading or changing DOM elements.
function evaluateReturnRequest(transaction, orderItemRecords, existingRequestKeys, todayDate) {
    const reasons = [];
    const submitted = transaction && typeof transaction === 'object' ? transaction : {};
    const records = Array.isArray(orderItemRecords) ? orderItemRecords : [];
    const requestKeys = existingRequestKeys instanceof Set ? existingRequestKeys : new Set();
    const customerId = normalized(String(submitted.customerId || ''));
    const orderId = normalized(String(submitted.orderId || ''));
    const sku = normalized(String(submitted.sku || ''));

    const record = records.find(item =>
        normalized(item.customerId) === customerId
        && normalized(item.orderId) === orderId
        && normalized(item.sku) === sku
    );

    // BR-2: Verify that the transaction identifies an item on this customer's order.
    if (!customerId || !orderId || !sku || !record) {
        reasons.push('Customer ID, Order ID, and item must match a purchased order item.');
    }

    if (record) {
        // BR-1: Allow returns through exactly 60 calendar days after delivery.
        if (isReturnWindowExpired(record.deliveryDate, todayDate)) {
            reasons.push('The return window is limited to 60 calendar days after delivery.');
        }

        // BR-3: Allow only a positive whole-number quantity within the unreturned balance.
        const quantityResult = checkReturnQuantity(
            record.quantityPurchased,
            record.quantityPreviouslyReturned,
            String(submitted.returnQuantity ?? '')
        );
        if (!quantityResult.isValid) {
            reasons.push(quantityResult.message);
        }

        // BR-4: Final-sale and clearance items cannot be returned.
        if (record.finalSale || record.clearance) {
            reasons.push('Final-sale and clearance items are not returnable.');
        }

        // BR-5: Reject order-items with an existing or previously approved request.
        if (record.existingReturnRequest
            || requestKeys.has(requestKey(record.customerId, record.orderId, record.sku))) {
            reasons.push('A return request already exists for this order item.');
        }
    }

    const decision = reasons.length === 0 ? 'Approved' : 'Rejected';
    return {
        decision,
        reasons,
        message: decision === 'Approved'
            ? 'All return eligibility rules passed.'
            : reasons.join(' ')
    };
}

// Clears stale messages and order details whenever the active selection changes.
function clearDecisionMessages() {
    messageOutput.textContent = '';
    messageOutput.className = 'return-message';
    formErrors.textContent = '';
    formErrors.hidden = true;
}

function clearSelectedItem() {
    selectedOrderItem = null;
    quantityPurchasedInput.value = '';
    dayDeliveredInput.value = '';
    orderSummary.textContent = '';
    returnQuantityInput.value = '';
    quantityMessage.textContent = '';
    submitReturnButton.disabled = true;
    clearDecisionMessages();
}

function clearOrderInformation() {
    matchedOrderItems = [];
    lookupCustomerID = '';
    lookupOrderID = '';
    itemInput.replaceChildren(new Option('-- Find your order to select a purchased item --', ''));
    itemInput.disabled = true;
    clearSelectedItem();
}

function lookupIsCurrent() {
    return matchedOrderItems.length > 0
        && normalized(customerIDInput.value) === lookupCustomerID
        && normalized(orderIDInput.value) === lookupOrderID;
}

// BR-2: Verify the customer/order pair and list only items belonging to that order.
function handleOrderLookup() {
    clearOrderInformation();
    const customerId = normalized(customerIDInput.value);
    const orderId = normalized(orderIDInput.value);

    if (!customerId || !orderId) {
        lookupMessage.textContent = 'Enter both Customer ID and Order ID before searching.';
        return;
    }

    const orderItems = ORDER_ITEM_RECORDS.filter(record =>
        normalized(record.customerId) === customerId
        && normalized(record.orderId) === orderId
    );

    if (orderItems.length === 0) {
        lookupMessage.textContent = 'No matching order was found for that Customer ID and Order ID.';
        return;
    }

    matchedOrderItems = orderItems;
    lookupCustomerID = customerId;
    lookupOrderID = orderId;
    itemInput.replaceChildren(new Option('-- Select an item from this order --', ''));
    for (const record of matchedOrderItems) {
        itemInput.add(new Option(record.sku, record.sku));
    }
    itemInput.disabled = false;
    lookupMessage.textContent = 'Order found. Select the item you want to return.';
}

// BR-2: Confirm the selected SKU belongs to the matched order before enabling submission.
// Then fill the read-only order fields from that order-item record.
function handleItemSelection() {
    clearSelectedItem();
    if (!lookupIsCurrent() || !itemInput.value) {
        return;
    }

    const item = matchedOrderItems.find(record => record.sku === itemInput.value);
    if (!item
        || normalized(item.customerId) !== normalized(customerIDInput.value)
        || normalized(item.orderId) !== normalized(orderIDInput.value)) {
        lookupMessage.textContent = 'The selected item does not belong to the verified order. Find your order again.';
        clearOrderInformation();
        return;
    }

    selectedOrderItem = item;
    quantityPurchasedInput.value = String(item.quantityPurchased);
    dayDeliveredInput.value = item.deliveryDate;
    const remaining = item.quantityPurchased - item.quantityPreviouslyReturned;
    orderSummary.textContent = 'Previously returned: ' + item.quantityPreviouslyReturned
        + ' | Remaining eligible quantity: ' + remaining + '.';
    submitReturnButton.disabled = false;
    updateQuantityStatus();
}

function updateQuantityStatus() {
    if (!selectedOrderItem) {
        quantityMessage.textContent = '';
        return;
    }

    quantityMessage.textContent = checkReturnQuantity(
        selectedOrderItem.quantityPurchased,
        selectedOrderItem.quantityPreviouslyReturned,
        returnQuantityInput.value
    ).message;
}

function invalidateLookupIfIdentityChanges() {
    if (matchedOrderItems.length === 0) {
        return;
    }

    clearOrderInformation();
    lookupMessage.textContent = 'Customer ID or Order ID changed. Find your order again.';
}

// BR-2: Recheck customer, order, and SKU against the fictional records at submission.
// BR-4: Reject final-sale and clearance items.
// BR-5: Reject an item that already has a return request or was submitted this session.
// BR-6: Approve only when every applicable rule passes; otherwise show the rejection reasons.
// BR-7: Apply the automatic Submitted → Approved/Rejected sequence without manual approval.
function handleSubmit(event) {
    event.preventDefault();
    const transaction = {
        customerId: customerIDInput.value,
        orderId: orderIDInput.value,
        sku: itemInput.value,
        returnQuantity: returnQuantityInput.value,
        reason: descriptionInput.value.trim(),
        reportedCondition: reportedConditionInput.value,
        preferredRefundMethod: preferredRefundMethodInput.value
    };
    const verifiedSelection = lookupIsCurrent()
        && selectedOrderItem
        && normalized(selectedOrderItem.customerId) === normalized(transaction.customerId)
        && normalized(selectedOrderItem.orderId) === normalized(transaction.orderId)
        && normalized(selectedOrderItem.sku) === normalized(transaction.sku);
    const result = evaluateReturnRequest(
        transaction,
        ORDER_ITEM_RECORDS,
        submittedRequestKeys,
        currentDateISO()
    );

    if (!verifiedSelection) {
        result.decision = 'Rejected';
        result.reasons.push('Find and select an item from the verified order before submitting.');
        result.message = result.reasons.join(' ');
    }

    if (selectedOrderItem) {
        quantityMessage.textContent = checkReturnQuantity(
            selectedOrderItem.quantityPurchased,
            selectedOrderItem.quantityPreviouslyReturned,
            transaction.returnQuantity
        ).message;
    }

    messageOutput.textContent = 'SUBMITTED → ' + result.decision.toUpperCase() + ': ' + result.message;
    if (result.decision === 'Rejected') {
        messageOutput.className = 'return-message decision-rejected';
    } else {
        messageOutput.className = 'return-message decision-approved';
        submittedRequestKeys.add(requestKey(
            transaction.customerId,
            transaction.orderId,
            transaction.sku
        ));
    }
}

// Registers the lookup, selection, identity-change, quantity, and submit handlers.
if (findOrderButton) {
    findOrderButton.addEventListener('click', handleOrderLookup);
}

if (itemInput) {
    itemInput.addEventListener('change', handleItemSelection);
}

if (customerIDInput && orderIDInput) {
    customerIDInput.addEventListener('input', invalidateLookupIfIdentityChanges);
    orderIDInput.addEventListener('input', invalidateLookupIfIdentityChanges);
}

if (returnQuantityInput) {
    returnQuantityInput.addEventListener('input', () => {
        clearDecisionMessages();
        updateQuantityStatus();
    });
}

if (descriptionInput) {
    descriptionInput.addEventListener('input', clearDecisionMessages);
}

if (reportedConditionInput) {
    reportedConditionInput.addEventListener('change', clearDecisionMessages);
}

if (preferredRefundMethodInput) {
    preferredRefundMethodInput.addEventListener('change', clearDecisionMessages);
}

if (returnForm) {
    returnForm.addEventListener('submit', handleSubmit);
}

// ============================================================
// TESTS - open the browser console (F12) to see the results.
// Blank/default value plus four meaningful values.
// ============================================================

// BR-1 tests: false means the return window is still open; true means it is expired.
const testToday = currentDateISO();
console.log('--- BR-1 return-window tests ---');
console.log('Invalid delivery date ->', isReturnWindowExpired('', testToday)); // true
console.log('59 days ->', isReturnWindowExpired(dateDaysAgo(59), testToday)); // false
console.log('60 days ->', isReturnWindowExpired(dateDaysAgo(60), testToday)); // false
console.log('61 days ->', isReturnWindowExpired(dateDaysAgo(61), testToday)); // true

// BR-3 tests: quantity helper takes purchased, previously returned, then requested quantity.
console.log('--- BR-3 quantity tests ---');
console.log('Purchased 2, returned 0, request 1 ->', checkReturnQuantity(2, 0, 1)); // valid
console.log('Purchased 2, returned 0, request 2 ->', checkReturnQuantity(2, 0, 2)); // exact limit
console.log('Purchased 2, returned 0, request 3 ->', checkReturnQuantity(2, 0, 3)); // too many
console.log('Purchased 2, returned 0, request 0 ->', checkReturnQuantity(2, 0, 0)); // invalid

// BR-4 tests: the evaluator returns an approval or rejection with its reason.
console.log('--- BR-4 final-sale tests ---');
const regularItemTest = ORDER_ITEM_RECORDS.find(record => record.sku === 'TS-1001');
const finalSaleItemTest = ORDER_ITEM_RECORDS.find(record => record.sku === 'TS-2001');
console.log('Regular item ->', evaluateReturnRequest(
    { customerId: regularItemTest.customerId, orderId: regularItemTest.orderId, sku: regularItemTest.sku, returnQuantity: '1' },
    [regularItemTest],
    new Set(),
    testToday
));
console.log('Final-sale item ->', evaluateReturnRequest(
    { customerId: finalSaleItemTest.customerId, orderId: finalSaleItemTest.orderId, sku: finalSaleItemTest.sku, returnQuantity: '1' },
    [finalSaleItemTest],
    new Set(),
    testToday
));