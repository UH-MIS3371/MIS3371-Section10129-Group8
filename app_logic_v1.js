// TigerSteps - Product Return Request
// Business Rule BR-4 (Final-sale eligibility):
// If the item is marked "FINAL SALE" or was purchased at a clearance
// price, the request is Rejected.

// ============================================================
// PART 1 - SESSION 1: the rule by itself
// These are the values and the function we wrote first.
// Session 2 reuses this function instead of writing the rule again.
// ============================================================

// Item codes that are marked FINAL SALE.
const FINAL_SALE_ITEMS = ['TS-2001', 'TS-2002'];

// Item codes that were sold at a clearance price.
const CLEARANCE_ITEMS = ['TS-3001'];

// The rule. Returns true when the item CANNOT be returned.
function isFinalSale(itemCode) {
    return FINAL_SALE_ITEMS.includes(itemCode) || CLEARANCE_ITEMS.includes(itemCode);
}

// Builds the sentence we show the customer.
function returnMessageFor(itemCode) {
    if (itemCode === '') {
        return 'Select an item to check if it can be returned.';
    }
    if (isFinalSale(itemCode)) {
        return 'REJECTED: ' + itemCode + ' is a final sale or clearance item and cannot be returned.';
    }
    return 'APPROVED: ' + itemCode + ' is regular-price merchandise and can be returned.';
}

// BR-1: Return window is limited to 60 days after delivery.
function isReturnWindowExpired(deliveryDate) {
    if (!deliveryDate || deliveryDate === '') {
        return true;
    }

    const delivered = new Date(deliveryDate + 'T00:00:00');
    const today = new Date();

    if (Number.isNaN(delivered.getTime())) {
        return true;
    }

    delivered.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const daysSinceDelivery = Math.floor(
        (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
         Date.UTC(delivered.getFullYear(), delivered.getMonth(), delivered.getDate()))
        / (1000 * 60 * 60 * 24)
    );

    return daysSinceDelivery < 0 || daysSinceDelivery > 60;
}

function quantityMessageFor(quantityPurchased, returnQuantity) {
    if (quantityPurchased === '' || returnQuantity === '') {
        return '';
    }

    const purchased = Number(quantityPurchased);
    const requested = Number(returnQuantity);

    if (!Number.isFinite(purchased) || !Number.isFinite(requested) || purchased < 1 || requested < 1) {
        return 'Enter valid quantities greater than zero.';
    }

    if (requested > purchased) {
        return 'Return quantity cannot exceed the quantity originally purchased.';
    }

    return 'Return quantity is valid.';
}

// ============================================================
// PART 2 - SESSION 2: connect the rule to the page
// ============================================================

// Select the relevant HTML elements using querySelector.
const returnForm = document.querySelector('#returnForm');
const itemInput = document.querySelector('#itemSKU');
const quantityPurchasedInput = document.querySelector('#quantityPurchased');
const returnQuantityInput = document.querySelector('#returnQuantity');
const dayDeliveredInput = document.querySelector('#dayDelivered');
const quantityMessage = document.querySelector('#quantityMessage');
const messageOutput = document.querySelector('#returnMessage');

function updateQuantityStatus() {
    if (!quantityMessage) {
        return;
    }

    quantityMessage.textContent = quantityMessageFor(
        quantityPurchasedInput.value,
        returnQuantityInput.value
    );
}

// Runs when the customer submits the return request.
function handleSubmit(event) {
    event.preventDefault();

    const itemCode = itemInput.value;
    const quantityPurchased = Number(quantityPurchasedInput.value);
    const returnQuantity = Number(returnQuantityInput.value);
    const deliveryDate = dayDeliveredInput.value;
    const quantityIsValid = Number.isFinite(quantityPurchased) && Number.isFinite(returnQuantity)
        && quantityPurchased >= 1 && returnQuantity >= 1 && returnQuantity <= quantityPurchased;

    if (quantityMessage) {
        quantityMessage.textContent = quantityMessageFor(
            quantityPurchasedInput.value,
            returnQuantityInput.value
        );
    }

    const canReturn = itemCode !== ''
        && !isFinalSale(itemCode)
        && !isReturnWindowExpired(deliveryDate)
        && quantityIsValid;

    let decisionMessage = returnMessageFor(itemCode);

    if (itemCode === '') {
        decisionMessage = returnMessageFor(itemCode);
    } else if (!quantityIsValid) {
        decisionMessage = 'REJECTED: Return quantity must be a valid number greater than zero and cannot exceed the original purchase quantity.';
    } else if (isReturnWindowExpired(deliveryDate)) {
        decisionMessage = 'REJECTED: return window expired.';
    } else if (isFinalSale(itemCode)) {
        decisionMessage = returnMessageFor(itemCode);
    }

    messageOutput.textContent = decisionMessage;

    if (itemCode === '') {
        messageOutput.className = 'return-message';
    } else if (canReturn) {
        messageOutput.className = 'return-message decision-approved';
    } else {
        messageOutput.className = 'return-message decision-rejected';
    }

    console.log('Submitted item:', itemCode, '| Final sale?', isFinalSale(itemCode), '| Return window expired?', isReturnWindowExpired(deliveryDate));
}

if (returnForm) {
    returnForm.addEventListener('submit', handleSubmit);
}

if (quantityPurchasedInput && returnQuantityInput) {
    quantityPurchasedInput.addEventListener('input', updateQuantityStatus);
    returnQuantityInput.addEventListener('input', updateQuantityStatus);
}

// ============================================================
// TESTS - open the browser console (F12) to see the results.
// Blank/default value plus four meaningful values.
// ============================================================

console.log('--- BR-4 tests ---');
console.log('(blank) ->', returnMessageFor(''));
console.log('TS-1001 ->', returnMessageFor('TS-1001'));
console.log('TS-2001 ->', returnMessageFor('TS-2001'));
console.log('TS-2002 ->', returnMessageFor('TS-2002'));
console.log('TS-3001 ->', returnMessageFor('TS-3001'));

console.log('--- BR-1 tests ---');
console.log('invalid ->', isReturnWindowExpired(''));
console.log('future date ->', isReturnWindowExpired('2099-12-31'));
console.log('today ->', isReturnWindowExpired(new Date().toISOString().slice(0, 10)));
console.log('within 60 days ->', isReturnWindowExpired('2026-09-01'));
console.log('expired ->', isReturnWindowExpired('2026-07-01'));