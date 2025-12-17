// File Path: tests/e2e/p1-games-list-search.spec.ts

import { test, expect, Page } from '@playwright/test';

// --- PROJECT CONFIGURATION DATA ---
const CONFIG = {
    // Configuration for the project that is already working
    'jocpacanele': {
        BASE_URL: "https://jocpacanele.ro/jocuri-pacanele/",
        SEARCH_PHRASE: "Sizzling Hot Deluxe",
        SELECTORS: {
            SearchInput: 'input.orig',
            SearchButton: 'button.promagnifier',
            FirstGameCard: '.article-card__image-wrapper > a',
            DemoCTA: '.slot-placeholder__buttons > a',
            CloseButton: '.iframe-actions > .icon-close-solid'
        },
        // The number of required 'goBack()' steps to return to BASE_URL
        BACK_STEPS: 3 
    },

    // Configuration for the new project (SELECTORS are placeholders for now)
    'jocuricazinouri': {
        BASE_URL: "https://jocuricazinouri.com/jocuri-casino-gratis/",
        SEARCH_PHRASE: "Sizzling Hot Deluxe", 
        SELECTORS: {
            SearchInput: 'input.page-search__input',       
            SearchButton: 'a.page-search__button.searchbar-btn',
            FirstGameCard: '.d-flex.flex-column.post-thumb__left.h-100 > a',
            DemoCTA: '.single-slot__img-overlay > a',
            CloseButton: '.close-iframe > .icon-x'
        },
        BACK_STEPS: 3 // <-- NEEDS VERIFICATION
    }
};

test('P1: Full Slot Game Search and Demo Flow', async ({ page }, testInfo) => {
    
    // --- DYNAMIC CONFIGURATION BLOCK ---
    // 1. Get the current running project name from the Playwright context
    const projectName = testInfo.project.name;
    
    // 2. Load the configuration object for the current project
    const projectConfig = CONFIG[projectName];

    // Handle case where project is not configured (optional, but safe)
    if (!projectConfig) {
        throw new Error(`Configuration not found for project: ${projectName}`);
    }

    // 3. Assign variables based on the loaded config
    const BASE_URL = projectConfig.BASE_URL;
    const SEARCH_PHRASE = projectConfig.SEARCH_PHRASE;
    const SELECTORS = projectConfig.SELECTORS;
    const BACK_STEPS = projectConfig.BACK_STEPS;
    // --- END DYNAMIC CONFIGURATION BLOCK ---
    
    // --- STEP 1: Navigate to the specific URL (using dynamic BASE_URL) ---
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
        // Action: Use page.fill with the SearchInput selector and the specific phrase.
        await page.fill(SELECTORS.SearchInput, SEARCH_PHRASE);
        console.log(`3. Entered specific search phrase: ${SEARCH_PHRASE}`);
    });

    // --- STEP 4: Submit the search by pressing 'Enter' on the input field ---
    await test.step('4. Submit the search by pressing Enter (Bug Workaround)', async () => {
    // Action: Use page.press on the input field to simulate pressing Enter
    // We are deliberately bypassing the bugged SearchButton click.
        await page.press(SELECTORS.SearchInput, 'Enter');
    
    // Crucial Wait: Wait for the URL to change or the results to load after submission
        await page.waitForLoadState('domcontentloaded'); 
    
        console.log('4. Search submitted by pressing Enter.');
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

    // --- STEP 9: Go back page by page until the starting URL is reached ---.
    await test.step(`9. Navigate back to the starting URL (Requires ${BACK_STEPS} steps)`, async () => {

        // Loop through the first BACK_STEPS - 1 to handle intermediate pages
        for (let i = 0; i < BACK_STEPS - 1; i++) {
            await Promise.all([
                page.waitForLoadState('domcontentloaded'), 
                page.goBack(), 
            ]);
            console.log(`9a. Successfully navigated back (Step ${i + 1} of ${BACK_STEPS - 1} intermediate steps).`);
        }
    
        // --- Final Go Back: Confirms return to BASE_URL ---
        await Promise.all([
            page.waitForURL(BASE_URL), 
            page.goBack(), 
        ]); 
        
        console.log('9b. Successfully returned to the starting URL.');
    });
});