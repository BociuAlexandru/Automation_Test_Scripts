// File Path: tests/e2e/p1-games-list-search.spec.ts

import { test, expect, Page } from '@playwright/test';

// --- CONFIGURATION ---
// The specific starting URL for the JocPacanele project (Step 1 requirement)
const BASE_URL = "https://jocpacanele.ro/jocuri-pacanele/";
// The specific slot name to search for (Step 3 requirement)
const SEARCH_PHRASE = "Sizzling Hot Deluxe";

// Selectors extracted and verified in previous steps
const SELECTORS = {
    // Step 3: Search Input Field
    SearchInput: 'input.orig',
    // Step 4: Search Submit Button
    SearchButton: 'button.promagnifier',
    // Step 5: Element showing the search results count
    ResultsCount: '.resdrg strong',
    // Step 6: Link for the first game card (image wrapper > link)
    FirstGameCard: '.article-card__image-wrapper > a',
    // Step 7: Call to Action (CTA) button to start the demo
    DemoCTA: '.slot-placeholder__buttons > a',
    // Step 9: Close button on the game popup
    CloseButton: '.iframe-actions > .icon-close-solid'
};

test('P1: Full Slot Game Search and Demo Flow', async ({ page }) => {
    
    // --- STEP 1: Navigate to the specific URL: https://jocpacanele.ro/jocuri-pacanele/ ---
    // Action: Use page.goto to navigate to the exact starting link.
    await test.step(`1. Navigate directly to the starting URL: ${BASE_URL}`, async () => {
        await page.goto(BASE_URL);
        console.log(`1. Navigated to: ${BASE_URL}`);
    });

    // --- STEP 2: Ensure the page loads and is scrollable ---
    // Action: Wait for stability and perform a scroll. No selector needed.
    await test.step('2. Ensure page loads and scroll is correct', async () => {
        await page.waitForLoadState('networkidle');
        // Executes a small scroll to mimic user behavior and trigger lazy-loading
        await page.evaluate(() => window.scrollTo(0, 300));
        console.log('2. Page loaded and initial scroll performed.');
    });

    // --- STEP 3: Recognize the search bar and input the specific text 'Sizzling Hot Deluxe' ---
    // Action: Use page.fill with the SearchInput selector and the specific phrase.
    await test.step(`3. Enter specific search phrase: '${SEARCH_PHRASE}'`, async () => {
        await page.fill(SELECTORS.SearchInput, SEARCH_PHRASE);
        console.log(`3. Entered specific search phrase: ${SEARCH_PHRASE}`);
    });

    // --- STEP 4: Submit the search by clicking on the search icon ---
    // Action: Use page.click with the SearchButton selector.
    await test.step('4. Submit the search', async () => {
        await page.click(SELECTORS.SearchButton);
        console.log('4. Search submitted by clicking the magnifier icon.');
    });

    
    // --- STEP 5: Click on the first game card to redirect to the Single Slot page ---
    // Action: Use page.click with the FirstGameCard selector.
    await test.step('5. Click on the first game card', async () => {
        await page.click(SELECTORS.FirstGameCard);
        // Wait for the navigation to the new page to finish
        await page.waitForLoadState('domcontentloaded');
        console.log('5. Clicked game card and navigated to Single Slot page.');
    });

    // --- STEP 6: On the Single Slot page, click the CTA 'JOACĂ GRATIS' ---
    // Action: Use page.click with the DemoCTA selector.
    await test.step('6. Click the Demo CTA to open the popup', async () => {
        await page.click(SELECTORS.DemoCTA);
        console.log("6. Clicked 'JOACĂ GRATIS' (Demo CTA).");
    });

    // --- STEP 7: Wait for the demo game slot popup to fully load ---
    // Action: Wait for the visibility of the CloseButton, which signals the popup is ready.
    await test.step('7. Wait for the demo game slot popup to fully load', async () => {
        await expect(page.locator(SELECTORS.CloseButton)).toBeVisible({ timeout: 15000 });
        console.log("7. PASS: Demo game popup appears to be fully loaded.");
    });

    // --- STEP 8: Recognize the close button and click it to close the popup ---
    // Action: Use page.click with the CloseButton selector.
    await test.step('8. Close the demo game popup', async () => {
        await page.click(SELECTORS.CloseButton);
        // Assertion: Wait for the close button to become hidden, confirming the popup is dismissed
        await expect(page.locator(SELECTORS.CloseButton)).toBeHidden();
        console.log('8. Popup successfully closed.');
    });

    // --- STEP 9: Go back page by page until the starting URL is reached ---
    // Action: Use page.goBack() twice and confirm the URL matches BASE_URL.
    await test.step('9. Navigate back to the starting URL', async () => {
        // The previous step (closing the popup) leaves us on the Single Slot URL (3).

        // --- First Go Back: Single Slot URL (3) -> Search Results URL (2) ---
        await Promise.all([
            page.waitForLoadState('domcontentloaded'), 
            page.goBack(), 
        ]); 
        console.log('9a. Successfully navigated back to the search results page.');

        await Promise.all([
            page.waitForLoadState('domcontentloaded'), 
            page.goBack(), 
        ]); 

        // --- Second Go Back: Search Results URL (2) -> BASE_URL (1) ---
        // This is the final URL check the script requires.
        await Promise.all([
            page.waitForURL(BASE_URL), 
            page.goBack(), 
        ]); 
        
        console.log('9b. Successfully returned to the starting URL.');
    });
});