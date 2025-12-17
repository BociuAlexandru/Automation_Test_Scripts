// tests/e2e/p0-homepage-smoke-desktop.spec.ts (V79 - Jocsloturi Implemented)

// 💥 CRITICAL IMPORTS
import { test, expect, TestInfo, Page } from '@playwright/test'; 
import * as fs from "fs"; 
import path from "path"; 
import { siteConfigs, SiteName } from './config/sites'; 

/**
 * Helper to get the siteName from the Playwright Project Name.
 */
const getSiteNameFromProject = (projectName: string): SiteName => {
    return projectName as SiteName;
};

// --- CSV CONFIGURATION ---
const BASE_REPORT_DIR = path.join(process.cwd(), 'artifact-history');
const CSV_FAILURE_FILE = path.join(BASE_REPORT_DIR, 'homepage_smoke_failures.csv');
const CSV_HEADER = 'Project,Test ID,Failure Type,Details,Failing URL\n';

// --- CORE UTILITY FUNCTIONS ---
// Function to strip diacritics (accents/cedillas) for case-insensitive, character-insensitive comparison
function stripDiacritics(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// 🎯 NEW HELPER: Splits words based on case change and separates numbers/letters
function splitCamelCaseAndNumbers(text: string): string[] {
    // 1. Insert space where lowercase is followed by uppercase (e.g., LuckySeven -> Lucky Seven)
    let cleanedText = text
        .replace(/([a-z])([A-Z])/g, '$1 $2'); 
    
    // 2. Insert space where letter is followed by number (or vice versa)
    cleanedText = cleanedText
        .replace(/([a-z])([0-9])/g, '$1 $2')
        .replace(/([0-9])([a-z])/g, '$1 $2');

    // Remove non-word characters and split by space. Ensure results are lowercase for comparison.
    return cleanedText.trim().toLowerCase().split(/\s+/).filter(Boolean); 
}

// Check if H1 contains at least one word from the source text
function checkH1Content(sourceText: string, h1Text: string): boolean {
    const normalizedH1 = stripDiacritics(h1Text).toLowerCase();

    // Use the robust splitting helper on the original source text
    const sourceTokens = splitCamelCaseAndNumbers(sourceText)
        .map(token => stripDiacritics(token)) // Strip diacritics from split tokens (e.g., Păcănele)
        .filter(token => {
            // Check 1: Must be at least 2 characters long.
            if (token.length < 2) return false;
            // Check 2: Must contain at least one letter or number (e.g., '888', 'lucky')
            return /[a-z0-9]/.test(token);
        });

    // Fallback: If there are no significant tokens, assume success.
    if (sourceTokens.length === 0) return true;

    // Check if any significant token is present in the normalized H1 text
    const isMatch = sourceTokens.some(token => normalizedH1.includes(token));

    return isMatch;
}

async function humanizePage(page: Page) {
    // 1. Random Scroll (Simulate reading/browsing)
    await page.evaluate(() => {
        const heights = [200, 500, 800];
        const randomHeight = heights[Math.floor(Math.random() * heights.length)];
        window.scrollBy(0, randomHeight);
    });
    // 2. Small random pause (Simulate thought/processing)
    await page.waitForTimeout(Math.random() * 500 + 500); // 500ms to 1000ms delay
}

function csvEscape(str: string | null | undefined): string {
    if (str === null || str === undefined) return '""';
    return `"${String(str).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ')}"`;
}

function logFailureToCsv(projectName: string, testId: string, type: string, details: string, url: string) {
    const csvRow = `${csvEscape(projectName)},${csvEscape(testId)},${csvEscape(type)},${csvEscape(details)},${csvEscape(url)}`;
    
    // Ensure the directory exists before writing
    if (!fs.existsSync(BASE_REPORT_DIR)) {
        fs.mkdirSync(BASE_REPORT_DIR, { recursive: true });
    }
    
    // Append the row to the file
    fs.appendFileSync(CSV_FAILURE_FILE, csvRow + '\n', { encoding: 'utf8' });
}


// --- TYPE DEFINITION (Simplified for generic H1 test) ---
type MenuMapItem = { 
    name: string; 
    paths: string[]; 
    mainPath?: string; 
};

// --- UNIVERSAL MENU MAPS (Click-Triggered Sites) ---

// NOTE: All static menu map arrays have been removed for simplicity.
const SITE_TO_MENU_MAP: Record<SiteName, MenuMapItem[]> = {
    'beturi': [], 
    'casino.com.ro': [], 
    'jocpacanele': [], 
    'jocsloturi': [], // Added JS to map
    'supercazino': [], 
    'jocuricazinouri': [],
};

// Global soft failure accumulator (must be tracked outside of test functions)
let softFailuresAcc: string[] = [];


// --- H1: Homepage Load Performance (ID: H1) ---
test('H1: Homepage Load Performance - Initial Load and Key Elements Visibility', async ({ page }, testInfo: TestInfo) => { 
    
    const projectName = testInfo.project.name; 
    const siteName = getSiteNameFromProject(projectName);
    const config = siteConfigs[siteName];
    
    // 1. CSV Initialization (Run once for the first project in the test config)
    if (projectName === 'casino.com.ro' || projectName === 'beturi' || projectName === 'jocpacanele' || projectName === 'jocsloturi') { // Ensures initialization happens
        if (!fs.existsSync(BASE_REPORT_DIR)) {
            fs.mkdirSync(BASE_REPORT_DIR, { recursive: true });
        }
        // Only re-write the header if it's the very first project, otherwise append
        if (projectName === 'casino.com.ro') { 
             fs.writeFileSync(CSV_FAILURE_FILE, CSV_HEADER, { encoding: 'utf8' });
             console.log(`[CSV] Initialized ${CSV_FAILURE_FILE}`);
        }
        // Reset soft failure accumulator at the start of the entire test run
        softFailuresAcc = []; 
    }
    
    const baseURL = testInfo.project.use.baseURL!; 
    
    const startTime = Date.now();
    const response = await test.step('H1.1: Navigate to Homepage and Await Load', async () => {
        return page.goto('/', { waitUntil: 'load' });
    });
    
    const loadTime = Date.now() - startTime;
    const maxLoadTime = 30000; 
    
    // H1 Checks (Logic remains the same)
    const statusCode = response?.status() || 0;
    if (statusCode < 200 || statusCode >= 300) {
        logFailureToCsv(siteName, 'H1.1', 'Page Load Failure', `Non-2xx HTTP status code: ${statusCode}`, baseURL);
        throw new Error(`[${siteName}] H1.1 Failed: Received non-2xx HTTP status code: ${statusCode} at ${baseURL}`);
    }
    
    console.log(`[${siteName}] INFO: Page load time: ${loadTime}ms`);
    if (loadTime >= maxLoadTime) {
        logFailureToCsv(siteName, 'H1.2', 'Load Performance', `Page load exceeded ${maxLoadTime}ms. Actual: ${loadTime}ms.`, baseURL);
    }
    expect(loadTime, `[${siteName}] H1.2: Homepage should load in under ${maxLoadTime}ms. Actual: ${loadTime}ms.`).toBeLessThan(maxLoadTime);
    
    await test.step('H1.3a: Verify Main Header Visibility', async () => {
        const header = page.locator('header, .header, #main-header-wrapper, #header, #site-header, #masthead, [data-elementor-type="header"], #page, .site, .mega-menu-desktop-container, .main-header-bar-wrap').first();
        try {
            await expect(header, `Main site header element must be visible.`).toBeVisible({ timeout: 10000 });
        } catch (e) {
            logFailureToCsv(siteName, 'H1.3a', 'Element Visibility', 'Main Header not found/visible.', baseURL);
            throw e;
        }
    });

    await test.step('H1.3b: Verify Logo/Title Visibility/Existence', async () => {
        const logo = page.locator('.inline-block.max-w-\\[110px\\], a[href="/"], a[href="/#"], img[alt*="logo" i], h1').first();
        try {
            await expect(logo, `Site logo link must exist in the DOM and be enabled.`).toBeEnabled({ timeout: 10000 });
        } catch (e) {
            logFailureToCsv(siteName, 'H1.3b', 'Element Visibility', 'Logo/Title not found/enabled.', baseURL);
            throw e;
        }
    });
    
    await test.step('H1.3c: Verify Affiliate CTA Visibility', async () => {
        const cta = page.locator(config.ctaSelector).first();
        try {
            await expect(cta, `At least one primary affiliate CTA (${config.ctaSelector}) should be visible.`).toBeVisible();
        } catch (e) {
            logFailureToCsv(siteName, 'H1.3c', 'Element Visibility', `Affiliate CTA (${config.ctaSelector}) not visible.`, baseURL);
            throw e;
        }
    });

    testInfo.annotations.push({ type: 'Test ID', description: 'H1' });
});


// --- H2: Main Navigation Functionality (ID: H2) ---
test('H2: Main Navigation Functionality - Top Menu and Logo Link Check', async ({ page }, testInfo: TestInfo) => {
    
    const projectName = testInfo.project.name; 
    const siteName = getSiteNameFromProject(projectName);
    const config = siteConfigs[siteName];
    const baseURL = testInfo.project.use.baseURL!; 
    
    // Get the menu map for the current project
    const menuMap = SITE_TO_MENU_MAP[siteName] || []; 
    
    // H2.1 Initial Load (remains the same)
    await test.step('H2.1: Start on Homepage', async () => {
        console.log(`\n[${siteName}] === H2: Starting Navigation Test (H1 Validation) ===`);
        const initialResponse = await page.goto(baseURL, { waitUntil: 'load' }); 
        const initialStatusCode = initialResponse?.status() || 0;
        if (initialStatusCode < 200 || initialStatusCode >= 300) {
             logFailureToCsv(siteName, 'H2.1', 'Initial Load Fail', `Non-2xx status code: ${initialStatusCode}`, baseURL);
             throw new Error(`Initial Load Failed: Received non-2xx HTTP status code: ${initialStatusCode} for ${baseURL}`);
        }
    });
    
    // --- Step 3: Verify Logo Click (MOVED TO FRONT) ---
    await test.step('H2.4: Verify Logo Link Returns to Homepage', async () => {
        
        console.log(`[${siteName}] DEBUG: Testing logo click from: ${baseURL}`);

        // 🎯 LOGIC: Choose the Logo Selector based on the project
        let logoSelector: string;
        if (siteName === 'beturi') {
            logoSelector = '.custom-logo-link';
        } else if (siteName === 'casino.com.ro') {
            logoSelector = '.col-span-1 a[href="/"]'; 
        } else if (siteName === 'jocpacanele') {
            logoSelector = '.d-none.d-lg-block.logo-container > a'; 
        } else if (siteName === 'jocsloturi') {
            // 🎯 JS Selector: Using the standard custom-logo-link (Astra theme)
            logoSelector = '.custom-logo-link';
        } else {
            logoSelector = 'a[href="/"]'; // Default fallback
        }
        
        const logoLink = page.locator(logoSelector).first();
        
        // 1. Navigation setup (to be on a non-homepage page)
        const awayUrl = baseURL + '/logo-test-target';
        
        try {
            await page.goto(awayUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        } catch (e) {
            logFailureToCsv(siteName, 'H2.4 - Pre-check Nav Fail', 'Crash Recovery Failure', `Failed to navigate away before logo test.`, awayUrl);
            console.warn(`[${siteName}] WARNING: Failed pre-logo-click navigation setup. Skipping logo test.`);
            softFailuresAcc.push(`[${projectName}] H2.4: Failed pre-logo-click setup.`);
            return;
        }

        // 2. Check Link is Enabled/Visible & Click
        try {
            await expect(logoLink, `Site logo link should be enabled.`).toBeEnabled({ timeout: 5000 });
            await logoLink.click();
        } catch (e) {
             logFailureToCsv(siteName, 'H2.4 - Logo Click Fail', 'Logo Click Fail', `Logo locator failure or click failure.`, awayUrl);
             softFailuresAcc.push(`[${projectName}] H2.4: Logo element/click failed.`);
             console.error(`[${siteName}] ❌ FAILED: Logo element not found or click failed.`);
             return;
        }

        // 3. Final URL Assertion
        try {
            await page.waitForURL(baseURL + '/', { waitUntil: 'load', timeout: 30000 });
            expect(page.url(), `Clicking the logo should return to the root homepage ('/')`).toBe(baseURL + '/');
            console.log(`[${siteName}] ✅ LOGO CHECK PASSED: Redirected to: ${baseURL}/`);

        } catch (e) {
            logFailureToCsv(siteName, 'H2.4 - Logo Click Fail', 'Logo Click Fail', `Logo click failed to redirect to ${baseURL}/.`, baseURL);
            softFailuresAcc.push(`[${projectName}] H2.4: Logo redirect URL check failed.`);
            console.error(`[${siteName}] ❌ FAILED: Logo redirect failed.`);
        }
    });


    // --- Step 2: Iterate through each top menu item (OLD H2.2) ---
    await test.step('H2.2: Main Menu Link Validation', async () => {
        
        let parentSelector: string;
        let subMenuSelector: string;
        let isProjectDropdownOnly: boolean;

        // 🎯 LOGIC: Choose the Parent Selector based on the project
        if (siteName === 'beturi') {
            parentSelector = '#menu-main-menu > li';
            isProjectDropdownOnly = false; // Beturi uses mixed direct/dropdown links
            subMenuSelector = 'ul.sub-menu a';
        } else if (siteName === 'casino.com.ro') {
            parentSelector = '.header-desktop-menu > ul > li';
            isProjectDropdownOnly = true; // All top items are dropdown triggers
            subMenuSelector = 'ul.sub-menu a, .submenu-panel a';
        } else if (siteName === 'jocpacanele') {
            parentSelector = '.inner-navbar-collapse > ul > li'; 
            isProjectDropdownOnly = true; // All top items are dropdown triggers
            subMenuSelector = '.dropdown-menu a';
        } else if (siteName === 'jocsloturi') {
            // 🎯 JS Selectors
            parentSelector = '#primary-menu > li';
            isProjectDropdownOnly = false; // JS uses the theme's class for detection
            subMenuSelector = '.sub-menu a';
        } else {
            return;
        }
        
        // 1. Find all parent list items using the generalized selector
        const parentListItems = page.locator(parentSelector);
        const itemCount = await parentListItems.count();

        for (let i = 0; i < itemCount; i++) {
            const listItem = parentListItems.nth(i);

            // 2. Capture the clean text for H1 validation (e.g., "Moto GP" or "Concurs")
            const parentLink = listItem.locator('a').first();
            const rawItemText = await parentLink.textContent() || '';
            const cleanItemText = rawItemText.replace(/(\r\n|\n|\r|\s+)/gm, ' ').trim();

            // 🎯 CHECK: Guaranteed detection of menu item type
            const listItemClass = await listItem.getAttribute('class') || '';
            
            // Determine if it's a dropdown: If the project forces it, OR it has the class.
            const isDropdown = isProjectDropdownOnly || listItemClass.includes('menu-item-has-children') || listItemClass.includes('dropdown');
            
            // Check for the dropdown class
            const parentUrl = await parentLink.getAttribute('href') || '/';
            
            // Check if the item is empty or just a filler (e.g., empty LI tags)
            if (!cleanItemText || cleanItemText.length < 2) continue;


            await test.step(`H2.2: Testing Menu Item: [${cleanItemText}]`, async () => {
                
                // Note: We use a soft failure flag to track if anything failed inside this step.
                let stepFailed = false;
                
                // Initialize variables used in the catch block 
                let targetUrl = '';
                let subMenuText = '';

                try {
                    // Check if the parent link is visible before interacting
                    await expect(parentLink, `Parent link "${cleanItemText}" must be visible.`).toBeVisible({ timeout: 5000 });

                    // --- Dropdown Logic ---
                    if (isDropdown) { 
                        
                        // Rule 1: LI has .menu-item-has-children -> Treat as Dropdown Trigger Only.
                        
                        // Click to open the dropdown
                        await parentLink.click({ timeout: 5000 });
                        console.log(`[${projectName}] DEBUG: Triggering dropdown: "${cleanItemText}"`);

                        // Find all sub-links within this specific parent LI
                        const subLinks = listItem.locator(subMenuSelector); // Use project-specific selector
                        const subLinkCount = await subLinks.count();
                        
                        for (let j = 0; j < subLinkCount; j++) {
                            const subLink = subLinks.nth(j);
                            
                            subMenuText = await subLink.textContent() || '';
                            const subLinkHref = await subLink.getAttribute('href');
                            
                            // Clean sub-menu text (e.g., "Campionii Craciunului")
                            const cleanSubText = subMenuText.replace(/(\r\n|\n|\r|\s+)/gm, ' ').trim();
                            
                            // 🎯 FIX: Smart URL Construction
                            targetUrl = (subLinkHref && subLinkHref.startsWith('/')) 
                                ? (baseURL + subLinkHref) 
                                : subLinkHref || '';

                            await test.step(`Sublink Check: [${cleanItemText} / ${cleanSubText}]`, async () => {
                                try {
                                    // 1. Navigate using the actual HREF
                                    const navResponse = await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
                                    
                                    // 2. Status Code Check
                                    const navStatusCode = navResponse?.status() || 0;
                                    if (navStatusCode < 200 || navStatusCode >= 300) {
                                        throw new Error(`Non-2xx status code: ${navStatusCode} at URL: ${targetUrl}`);
                                    }
                                    
                                    // 3. H1 Validation (THE CORE NEW CHECK)
                                    const h1Locator = page.locator('h1').first();
                                    const h1Exists = await h1Locator.isVisible({ timeout: 3000 }).catch(() => false);
                                    let validationText = cleanSubText.length > 3 ? cleanSubText : cleanItemText; // Prefer sub-text

                                    if (h1Exists) {
                                        const h1Text = (await h1Locator.textContent())?.trim() || '';
                                        
                                        // 🎯 Assertion: Use the new flexible word inclusion check
                                        if (!checkH1Content(validationText, h1Text)) {
                                            // Soft failure: Log the assertion error but DO NOT throw
                                            const errorMsg = `H1 ("${h1Text}") does not contain significant words from menu text ("${validationText}").`;
                                            logFailureToCsv(siteName, `H2.2 - Sublink H1`, 'H1 Content Mismatch', errorMsg, targetUrl);
                                            // 🎯 FIX: Include H1 in terminal output
                                            console.error(`[${siteName}] ❌ FAILED: Sub-link "${cleanSubText}" failed validation against H1: ${h1Text}`);
                                            stepFailed = true;
                                        } else {
                                            // 🎯 FIX: Include H1 in terminal output
                                            console.log(`[${siteName}] ✅ PASSED: Sub-link "${cleanSubText}" validated against H1: ${h1Text}`);
                                        }
                                    } else {
                                        // EDGE CASE: H1 is missing entirely
                                        const errorMsg = `No <h1> element found on page. Expected: ${validationText}.`;
                                        logFailureToCsv(siteName, `H2.2 - Sublink H1`, 'Missing H1 Element', errorMsg, targetUrl);
                                        // 🎯 FIX: Include failure in terminal output
                                        console.error(`[${siteName}] ❌ FAILED: Sub-link "${cleanSubText}" failed H1 validation (Missing H1).`);
                                        stepFailed = true;
                                    }

                                    // 4. Humanization
                                    await humanizePage(page);
                                    
                                    // 5. Go back to the homepage (Guaranteed return)
                                    await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 });
                                    
                                } catch (error) {
                                    // Log fatal failure (503/Timeout/Crash)
                                    const errorDetails = error instanceof Error ? error.message.split('\n')[0] : 'Unknown error.';
                                    logFailureToCsv(siteName, `H2.2 - Sublink Redirect`, 'Nav/Status/Crash Fail', errorDetails, targetUrl);
                                    
                                    console.error(`[${siteName}] ❌ FAILED: Sub-link "${cleanSubText}" failed. Error: ${errorDetails}`);
                                    stepFailed = true;
                                    
                                    // CRITICAL RECOVERY: Ensure return to homepage on failure to stabilize the browser
                                    try {
                                        await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 });
                                    } catch (recoverError) {
                                        console.warn(`[${siteName}] CRITICAL WARNING: Failed to reset page state after error. Resuming test loop...`);
                                    }
                                }
                            });
                        } // End of subLinks loop

                    } else { 
                        // --- Direct Link Logic (Rule 2) ---
                        const linkHref = await parentLink.getAttribute('href');
                        
                        // 🎯 FIX: Smart URL Construction
                        targetUrl = (linkHref && linkHref.startsWith('/')) 
                            ? (baseURL + linkHref) 
                            : linkHref || '';


                        await test.step(`Direct Link Check: [${cleanItemText}]`, async () => {
                            try {
                                // 🎯 CHECK: If the link is just a placeholder (common for non-dropdowns that don't need linking)
                                if (targetUrl === '#' || targetUrl === baseURL + '#' || targetUrl === baseURL + '/') { 
                                    console.warn(`[${siteName}] ⚠️ WARN: Direct link "${cleanItemText}" is a placeholder (#) or base link (/) and skipped H1 check.`);
                                    return;
                                }

                                const navResponse = await page.goto(targetUrl!, { waitUntil: 'load', timeout: 30000 });
                                
                                // Status Code Check
                                const navStatusCode = navResponse?.status() || 0;
                                if (navStatusCode < 200 || navStatusCode >= 300) {
                                    throw new Error(`Non-2xx status code: ${navStatusCode} at URL: ${targetUrl}`);
                                }

                                // H1 Validation (THE CORE NEW CHECK)
                                const h1Locator = page.locator('h1').first();
                                const h1Exists = await h1Locator.isVisible({ timeout: 3000 }).catch(() => false);
                                
                                // Initialize H1 text for logging
                                let h1Text = '';
                                
                                if (h1Exists) {
                                    h1Text = (await h1Locator.textContent())?.trim() || '';
                                    
                                    // 🎯 Assertion: Use the new flexible word inclusion check
                                    if (!checkH1Content(cleanItemText, h1Text)) {
                                        // Soft failure: Log the assertion error but DO NOT throw
                                        const errorMsg = `H1 ("${h1Text}") does not contain significant words from menu text ("${cleanItemText}").`;
                                        logFailureToCsv(siteName, 'H2.2 - Direct Link H1', 'H1 Content Mismatch', errorMsg, targetUrl!);
                                        // 🎯 FIX: Include H1 in terminal output
                                        console.error(`[${siteName}] ❌ FAILED: Direct link "${cleanItemText}" failed validation against H1: ${h1Text}`);
                                        stepFailed = true;
                                    } else {
                                        // 🎯 FIX: Include H1 in terminal output
                                        console.log(`[${siteName}] ✅ PASSED: Direct link "${cleanItemText}" validated against H1: ${h1Text}`);
                                    }
                                } else {
                                    // EDGE CASE: H1 is missing entirely
                                    const errorMsg = `No <h1> element found on page. Expected: ${cleanItemText}.`;
                                    logFailureToCsv(siteName, 'H2.2 - Direct Link H1', 'Missing H1 Element', errorMsg, targetUrl!);
                                    // 🎯 FIX: Include failure in terminal output
                                    console.error(`[${siteName}] ❌ FAILED: Direct link "${cleanItemText}" failed H1 validation (Missing H1).`);
                                    stepFailed = true;
                                }
                                
                                await humanizePage(page);
                                await page.goto(baseURL, { waitUntil: 'load', timeout: 30000 });
                                
                            } catch (error) {
                                // Log failure and attempt recovery (for 503/Timeout/Crash)
                                const errorDetails = error instanceof Error ? error.message.split('\n')[0] : 'Unknown error.';
                                logFailureToCsv(siteName, 'H2.2 - Direct Link Nav', 'Nav/Status/Crash Fail', errorDetails, targetUrl!);
                                console.error(`[${siteName}] ❌ FAILED: Direct link "${cleanItemText}" failed. Error: ${errorDetails}`);
                                stepFailed = true;
                                
                                await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 }).catch(recoverError => {
                                    console.warn(`[${siteName}] CRITICAL WARNING: Failed to reset page state after error.`);
                                });
                            }
                        });
                    }
                    
                } catch (error) {
                    // Catch initial parent visibility error or structural error
                    const errorDetails = error instanceof Error ? error.message.split('\n')[0] : 'Unknown structural error.';
                    logFailureToCsv(siteName, 'H2.2 - Parent Check', 'Structural Error', errorDetails, baseURL + parentUrl);
                    
                    console.error(`[${siteName}] ❌ FAILED: Parent item "${cleanItemText}" failed structural test.`);
                    stepFailed = true;
                    // Attempt to reset state before allowing Playwright to fail the step
                    await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 }).catch(recoverError => {
                        console.warn(`[${siteName}] CRITICAL WARNING: Failed to reset browser state after structural error.`);
                    });
                }

                // If any check failed within this parent item, record the soft failure status globally.
                if (stepFailed) {
                    softFailuresAcc.push(`[${projectName}] H2.2: ${cleanItemText} failed one or more checks.`);
                }
            });
        } // End of parent menu loop
    }); // End of H2.2 Step (The Menu Loop)

    
    // --- Step 4: Final Assertion ---
    testInfo.annotations.push({ type: 'Test ID', description: 'H2' });
    
    // 🎯 FINAL ASSERTION: Check global soft failure accumulator
    if (softFailuresAcc.length > 0) {
        throw new Error(`H2 test completed with ${softFailuresAcc.length} soft failures. Check CSV for details.`);
    }
});