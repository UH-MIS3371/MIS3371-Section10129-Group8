// TigerSteps - Product Return Request
// Browser logic: feedback and display only.
//
// This file holds no order records and no business rules. It asks the local
// server for the customer's order (GET /api/orders) and sends the return
// request to it (POST /api/returns). backend/backend.js decides Approved or
// Rejected. Anything checked here is only a hint for the customer.

// ============================================================
// Shared helpers
// ============================================================

// Removes outside spaces and ignores upper/lower case, so " c1001 " and
// "C1001" count as the same ID.
function normalize(value) {
    return String(value ?? '').trim().toUpperCase();
}

// IDs and item codes are compared without case or spacing differences.
function sameText(first, second) {
    return normalize(first) === normalize(second);
}

// Where the API lives.
// AWS_API_URL: paste the API Gateway Invoke URL here before building
// frontend.zip, for example 'https://abc123.execute-api.us-east-1.amazonaws.com'
// (no slash at the end). This is the only line to change for AWS.
const AWS_API_URL = '';

// Opened through the local Express server (npm start): the API is on the same
// server, so no address is needed. Opened anywhere else (Amplify): use AWS.
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const API_BASE_URL = IS_LOCAL ? '' : AWS_API_URL;

const CONNECTION_MESSAGE = IS_LOCAL
    ? 'Cannot reach the TigerSteps server. Start it with npm start and try again.'
    : 'Cannot reach the TigerSteps service. Check your connection and try again.';

// ============================================================
// Page wiring
// ============================================================

const returnForm = document.querySelector('#returnForm');
const customerIdInput = document.querySelector('#customerId');
const orderIdInput = document.querySelector('#orderId');
const findOrderButton = document.querySelector('#findOrderButton');
const lookupMessage = document.querySelector('#lookupMessage');
const skuInput = document.querySelector('#sku');
const quantityPurchasedInput = document.querySelector('#quantityPurchased');
const deliveryDateInput = document.querySelector('#deliveryDate');
const orderSummary = document.querySelector('#orderSummary');
const returnQuantityInput = document.querySelector('#returnQuantity');
const quantityMessage = document.querySelector('#quantityMessage');
const reportedConditionInput = document.querySelector('#reportedCondition');
const reasonInput = document.querySelector('#reason');
const formErrors = document.querySelector('#formErrors');
const messageOutput = document.querySelector('#returnMessage');
const statusSteps = document.querySelectorAll('#returnState .status-step');
const stepItem = document.querySelector('#stepItem');
const stepDetails = document.querySelector('#stepDetails');

// The order confirmed by the last lookup, and the item chosen from it.
let matchedOrderItems = [];
let lookupCustomerId = '';
let lookupOrderId = '';
let selectedOrderItem = null;

// True while an Approved or Rejected result is on screen.
let hasDecision = false;

// The refund method is a radio group, so read whichever card is checked.
function selectedRefundMethod() {
    const checked = document.querySelector('input[name="preferredRefundMethod"]:checked');
    return checked ? checked.value : '';
}

// Draft, Submitted, Decision. The stylesheet draws is-done, is-current, and
// is-rejected on these three steps.
function setStatusRail(stage) {
    if (statusSteps.length < 3) {
        return;
    }

    statusSteps.forEach(step => step.classList.remove('is-done', 'is-current', 'is-rejected'));

    if (stage === 'draft') {
        statusSteps[0].classList.add('is-current');
        return;
    }

    statusSteps[0].classList.add('is-done');
    statusSteps[1].classList.add('is-done');
    statusSteps[2].classList.add(stage === 'approved' ? 'is-done' : 'is-rejected');
}

function lockStep(step, locked) {
    if (step) {
        step.classList.toggle('is-locked', locked);
    }
}

function showLookupMessage(text, isError) {
    lookupMessage.textContent = text;
    lookupMessage.classList.toggle('is-error', Boolean(isError));
}

// Clears any decision so an old Approved never sits beside changed values.
function clearDecision() {
    hasDecision = false;
    messageOutput.textContent = 'Enter your Customer ID and Order ID to begin.';
    messageOutput.className = 'return-message';
    formErrors.textContent = '';
    formErrors.hidden = true;
    setStatusRail('draft');
}

function clearSelectedItem() {
    selectedOrderItem = null;
    quantityPurchasedInput.value = '';
    deliveryDateInput.value = '';
    orderSummary.textContent = '—';
    returnQuantityInput.value = '';
    quantityMessage.textContent = '';
    lockStep(stepDetails, true);
    clearDecision();
}

function clearOrder() {
    matchedOrderItems = [];
    lookupCustomerId = '';
    lookupOrderId = '';
    skuInput.replaceChildren(new Option('Select an item from this order', ''));
    lockStep(stepItem, true);
    clearSelectedItem();
}

// True while the typed IDs still match the order the lookup confirmed.
function lookupIsCurrent() {
    return matchedOrderItems.length > 0
        && sameText(customerIdInput.value, lookupCustomerId)
        && sameText(orderIdInput.value, lookupOrderId);
}

// BR-2 lookup: the server checks the customer and order pair and sends back
// only that order's items, with safe fields only.
async function handleOrderLookup() {
    clearOrder();

    const customerId = customerIdInput.value.trim();
    const orderId = orderIdInput.value.trim();

    if (!customerId || !orderId) {
        showLookupMessage('Enter both Customer ID and Order ID first.', true);
        return;
    }

    showLookupMessage('Looking up your order...', false);

    let response;
    let body;
    try {
        const query = new URLSearchParams({ customerId, orderId });
        response = await fetch(API_BASE_URL + '/api/orders?' + query.toString());
        body = await response.json();
    } catch (error) {
        showLookupMessage(CONNECTION_MESSAGE, true);
        return;
    }

    // The customer may have edited an ID while the request was on its way.
    if (!sameText(customerIdInput.value, customerId) || !sameText(orderIdInput.value, orderId)) {
        return;
    }

    if (!response.ok || !Array.isArray(body.items) || body.items.length === 0) {
        showLookupMessage(body.message || 'No order matches that Customer ID and Order ID.', true);
        return;
    }

    matchedOrderItems = body.items;
    lookupCustomerId = customerId;
    lookupOrderId = orderId;

    skuInput.replaceChildren(new Option('Select an item from this order', ''));
    for (const item of matchedOrderItems) {
        skuInput.add(new Option(item.sku + ' · ' + item.name, item.sku));
    }

    lockStep(stepItem, false);
    showLookupMessage('Order found. ' + matchedOrderItems.length + ' item(s) on this order.', false);
    messageOutput.textContent = 'Choose the item you want to return.';
}

// The chosen item must be one the lookup returned. The read-only fields show
// values from the server so the customer can see them. They are never sent
// back: the backend reads its own order record.
function handleItemSelection() {
    clearSelectedItem();

    if (!lookupIsCurrent() || !skuInput.value) {
        return;
    }

    const orderItem = matchedOrderItems.find(item => sameText(item.sku, skuInput.value));
    if (!orderItem) {
        showLookupMessage('That item is not on the order we found. Search again.', true);
        clearOrder();
        return;
    }

    selectedOrderItem = orderItem;
    quantityPurchasedInput.value = String(orderItem.quantityPurchased);
    deliveryDateInput.value = orderItem.deliveryDate;
    orderSummary.textContent = orderItem.remainingEligibleQuantity + ' of ' + orderItem.quantityPurchased
        + ' (returned ' + orderItem.quantityPreviouslyReturned + ')';
    lockStep(stepDetails, false);

    // BR-4 preview from the server. The decision still happens on submit.
    if (orderItem.returnable === false) {
        messageOutput.textContent = orderItem.returnableMessage;
        return;
    }
    messageOutput.textContent = 'Fill in the return details, then check eligibility.';
}

// BR-3 hint while the customer types. Feedback only: the backend checks the
// quantity again against its own record.
function updateQuantityStatus() {
    if (!selectedOrderItem) {
        quantityMessage.textContent = '';
        return;
    }

    const remaining = Number(selectedOrderItem.remainingEligibleQuantity);
    const text = returnQuantityInput.value.trim();
    const requested = Number(text);

    if (remaining < 1) {
        quantityMessage.textContent = 'No quantity remains eligible for return.';
    } else if (text === '' || !Number.isInteger(requested) || requested < 1) {
        quantityMessage.textContent = 'Enter a positive whole number to return.';
    } else if (requested > remaining) {
        quantityMessage.textContent = 'You can return at most ' + remaining + ' of these.';
    } else {
        quantityMessage.textContent = requested + ' of ' + remaining + ' eligible.';
    }
}

// BR-7: a result belongs to the values that were sent. If the customer edits
// any field after that, the form is a new Draft that has not been checked yet.
function handleFormEdited() {
    if (!hasDecision) {
        return;
    }

    clearDecision();
    messageOutput.textContent = 'Details changed. Select Check return eligibility again.';
}

// Editing either ID throws away a lookup that no longer applies.
function handleIdentityChange() {
    if (matchedOrderItems.length === 0) {
        return;
    }

    clearOrder();
    showLookupMessage('Customer ID or Order ID changed. Find your order again.', true);
}

// Shows a validation error: the request never became a decision, so the
// status rail stays on Draft.
function showValidationProblems(problems) {
    formErrors.textContent = problems.join(' ');
    formErrors.hidden = false;
    messageOutput.textContent = 'Some details are missing or not valid. Check the form.';
    messageOutput.className = 'return-message';
    setStatusRail('draft');
}

// The ONE submit handler. It sends the request to the backend and shows the
// decision that comes back. Three outcomes are kept apart:
//   200            the backend approved the request
//   400            the request reached the backend: validation error or Rejected
//   fetch throws   the server could not be reached at all
async function handleSubmit(event) {
    event.preventDefault();

    // A form box always holds text, but the contract wants returnQuantity as a
    // JSON number. An empty box is sent as null so the backend says "required".
    const quantityText = returnQuantityInput.value.trim();

    // Only the seven contract fields. Order details (delivery date, quantity
    // purchased) are never sent: the backend reads its own record.
    const transaction = {
        customerId: customerIdInput.value.trim(),
        orderId: orderIdInput.value.trim(),
        sku: skuInput.value,
        returnQuantity: quantityText === '' ? null : Number(quantityText),
        reason: reasonInput.value.trim(),
        reportedCondition: reportedConditionInput.value,
        preferredRefundMethod: selectedRefundMethod()
    };

    formErrors.textContent = '';
    formErrors.hidden = true;
    messageOutput.textContent = 'Checking your request...';
    messageOutput.className = 'return-message';

    let response;
    let result;
    try {
        response = await fetch(API_BASE_URL + '/api/returns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(transaction)
        });
        result = await response.json();
    } catch (error) {
        messageOutput.textContent = CONNECTION_MESSAGE;
        messageOutput.className = 'return-message decision-rejected';
        setStatusRail('draft');
        return;
    }

    if (result.error === 'Validation') {
        showValidationProblems(result.problems || [result.message]);
        return;
    }

    if (response.ok && result.status === 'Approved') {
        // Nothing is saved before Week 11, so never say "saved".
        messageOutput.textContent = 'Approved. All return rules passed. Reference ' + result.returnId
            + ' (not saved yet).';
        messageOutput.className = 'return-message decision-approved';
        setStatusRail('approved');
    } else if (result.status === 'Rejected') {
        const reasons = Array.isArray(result.reasons) ? result.reasons : [];
        messageOutput.textContent = 'Rejected. '
            + (reasons.map(reason => reason.rule + ': ' + reason.message).join(' ') || result.message || '');
        messageOutput.className = 'return-message decision-rejected';
        setStatusRail('rejected');
    } else {
        // Not a decision at all: a server error (500) or a wrong address (404).
        // Never show this as Rejected. The request can be sent again.
        messageOutput.textContent = 'The return service had a problem (HTTP ' + response.status
            + '). Your request was not decided. Please try again.';
        messageOutput.className = 'return-message decision-rejected';
        setStatusRail('draft');
        return;
    }

    hasDecision = true;
}

if (returnForm) {
    returnForm.addEventListener('submit', handleSubmit);
    // Typing (input) and choosing (change) both bubble up to the form.
    returnForm.addEventListener('input', handleFormEdited);
    returnForm.addEventListener('change', handleFormEdited);
    clearOrder();
    showLookupMessage('', false);
}

if (findOrderButton) {
    findOrderButton.addEventListener('click', handleOrderLookup);
}

if (customerIdInput && orderIdInput) {
    customerIdInput.addEventListener('input', handleIdentityChange);
    orderIdInput.addEventListener('input', handleIdentityChange);
}

if (skuInput) {
    skuInput.addEventListener('change', handleItemSelection);
}

if (returnQuantityInput) {
    returnQuantityInput.addEventListener('input', updateQuantityStatus);
}
