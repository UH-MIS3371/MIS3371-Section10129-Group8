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


// ============================================================
// PART 2 - SESSION 2: connect the rule to the page
// ============================================================

// Select the relevant HTML elements using querySelector.
const returnForm = document.querySelector('#returnForm');
const itemInput = document.querySelector('#itemSKU');
const messageOutput = document.querySelector('#returnMessage');

// Runs when the customer submits the return request.
function handleSubmit(event) {
    // Stop the page from reloading. This is a demo, so nothing is sent
    // to a server and we can show the decision on the same page.
    event.preventDefault();

    // Read the input value and convert it when needed.
    // A dropdown value is always a string, and our rule compares strings,
    // so no conversion is needed here. If we were reading a number instead
    // (for example a quantity box) we would write Number(itemInput.value).
    const itemCode = itemInput.value;

    // Reuse the Session 1 function. The rule is not repeated here.
    const canReturn = itemCode !== '' && isFinalSale(itemCode) === false;

    // Update the one visible page message with textContent.
    messageOutput.textContent = returnMessageFor(itemCode);

    // Colour the message so the decision is easy to see.
    if (itemCode === '') {
        messageOutput.className = 'return-message';
    } else if (canReturn) {
        messageOutput.className = 'return-message decision-approved';
    } else {
        messageOutput.className = 'return-message decision-rejected';
    }

    console.log('Submitted item:', itemCode, '| Final sale?', isFinalSale(itemCode));
}

// Listen for the submit event on the form.
returnForm.addEventListener('submit', handleSubmit);


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