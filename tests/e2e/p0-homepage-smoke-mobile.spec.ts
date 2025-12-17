// tests/e2e/p0-homepage-smoke-mobile.spec.ts (V78 - Jocsloturi Implemented)

// CRITICAL IMPORTS
import { test, expect, TestInfo, devices, Locator } from '@playwright/test'; 
import * as fs from "fs"; 
import { siteConfigs, SiteName } from './config/sites'; 
import {
    BASE_REPORT_DIR,
    CSV_FAILURE_FILE,
    CSV_HEADER,
    SITE_TO_MENU_MAP,
    MOBILE_MENU_CONFIG,
    closeCookiePopupIfPresent,
    closeOptionalPopupIfPresent,
    checkH1Content,
    humanizePage,
    buildAbsoluteUrl,
    logFailureToCsv,
} from './helpers/mobileMenuUtils';

/**
 * Helper to get the siteName from the Playwright Project Name.
 */
const getSiteNameFromProject = (projectName: string): SiteName => {
    return projectName as SiteName;
};

// Force iPhone 13 mobile context for this spec
const { defaultBrowserType: _ignored, ...iPhone13Descriptor } = devices["iPhone 13"];
test.use({
    ...iPhone13Descriptor,
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    permissions: ["geolocation"],
    ignoreHTTPSErrors: true,
});

type SubLinkRecord = { text: string; href: string };

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
    await closeCookiePopupIfPresent(page, siteName);
    
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
        await closeCookiePopupIfPresent(page, siteName);
    });
    
    // --- Step 3: Verify Logo Click (MOVED TO FRONT) ---
    await test.step('H2.4: Verify Logo Link Returns to Homepage', async () => {
        
        console.log(`[${siteName}] DEBUG: Testing logo click from: ${baseURL}`);

        // LOGIC: Choose the Logo Selector based on the project
        let logoSelector: string;
        if (siteName === 'beturi') {
            logoSelector = '.mobile-logo a[rel="home"]';
        } else if (siteName === 'casino.com.ro') {
            logoSelector = '.inline-block.max-w-\\[110px\\]';
        } else if (siteName === 'jocpacanele') {

            logoSelector = '.d-lg-none.logo-container .custom-logo-link, .logo-container .custom-logo-link'; 

        } else if (siteName === 'supercazino') {
            logoSelector = '#nav-mobile-sc-logo, a:has(#nav-mobile-sc-logo)';
        } else if (siteName === 'jocuricazinouri') {
            logoSelector = '.jcTopLogo .logo-wrapper';
        } else if (siteName === 'jocsloturi') {
            // JS Selector: Using the standard custom-logo-link (Astra theme)
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
        
        const mobileMenuConfig = MOBILE_MENU_CONFIG[siteName];

        if (!mobileMenuConfig) {
            console.warn(`[${siteName}] Mobile menu config not implemented yet. Skipping H2.2 for this project.`);
            return;
        }

        const {
            burgerSelector,
            menuRootSelector,
            parentItemsSelector,
            parentLinkSelector = 'a',
            subMenuLinkSelector,
            subMenuLinkSelectorWithinContainer,
            subToggleSelector,
            useParentItemAsLink = false,
            forceDropdownParents = false,
        } = mobileMenuConfig;

        const ensureMobileMenuOpen = async () => {
            await closeCookiePopupIfPresent(page, siteName);
            await closeOptionalPopupIfPresent(page, siteName);
            if (!burgerSelector) return;

            const menuRoot = menuRootSelector ? page.locator(menuRootSelector) : null;
            if (menuRoot && await menuRoot.isVisible()) {
                return;
            }

            const burger = page.locator(burgerSelector).first();
            await expect(burger, 'Mobile burger trigger should be visible').toBeVisible({ timeout: 5000 });

            await burger.scrollIntoViewIfNeeded();
            await burger.click({ timeout: 5000, force: true });
            await closeOptionalPopupIfPresent(page, siteName);

            if (menuRoot) {
                const pollStart = Date.now();
                while (Date.now() - pollStart < 5000) {
                    if (await menuRoot.isVisible()) {
                        return;
                    }
                    await page.waitForTimeout(150);
                }
                console.warn(`[${siteName}] WARN: Mobile menu root still hidden after burger click; continuing with DOM locators.`);
            }
        };

        let parentListItems: Locator = page.locator(parentItemsSelector);

        const resolveParentLink = (item: Locator): Locator => {
            if (useParentItemAsLink || !parentLinkSelector) {
                return item;
            }
            return item.locator(parentLinkSelector).first();
        };

        const waitForMenuItems = async () => {
            parentListItems = page.locator(parentItemsSelector);
            try {
                await parentListItems.first().waitFor({ state: 'attached', timeout: 5000 });
                await parentListItems.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
            } catch (err) {
                console.warn(`[${siteName}] WARN: Menu items not ready yet; retrying burger open.`);
                await ensureMobileMenuOpen();
                parentListItems = page.locator(parentItemsSelector);
                await parentListItems.first().waitFor({ state: 'attached', timeout: 5000 });
                await parentListItems.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
            }
        };

        const prepareMenuState = async () => {
            await ensureMobileMenuOpen();
            await waitForMenuItems();
        };

        await prepareMenuState();

        const itemCount = await parentListItems.count();
        console.log(`[${siteName}] DEBUG: Found ${itemCount} top-level mobile menu items.`);
        

        if (itemCount === 0) {
            logFailureToCsv(siteName, 'H2.2 - Menu Structure', 'No mobile menu parent items found', parentItemsSelector, baseURL);
            throw new Error(`[${siteName}] H2.2 aborted: No mobile menu parent items found using selector "${parentItemsSelector}".`);
        }

        for (let i = 0; i < itemCount; i++) {
            await prepareMenuState();
            const listItem = parentListItems.nth(i);
            await listItem.waitFor({ state: 'attached', timeout: 3000 }).catch(() => {});
            const parentLink = resolveParentLink(listItem);
            await parentLink.waitFor({ state: 'attached', timeout: 3000 }).catch(() => {});
            
            const rawItemText = await parentLink.textContent() || '';
            const cleanItemText = rawItemText.replace(/(\r\n|\n|\r|\s+)/gm, ' ').trim();

            // Guaranteed detection of menu item type
            const listItemClass = await listItem.getAttribute('class') || '';
            const subMenuLocator = listItem.locator('.sub_menu, .sub-menu, ul.sub-menu');
            const hasExplicitSubMenu = await subMenuLocator.count() > 0;
            
            // Determine if it's a dropdown: If the project forces it, OR it has the class.
            const isDropdown =
                forceDropdownParents ||
                listItemClass.includes('menu-item-has-children') ||
                listItemClass.includes('dropdown') ||
                listItemClass.includes('has_children') ||
                hasExplicitSubMenu;
            
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
                        const subToggle = (subToggleSelector
                            ? listItem.locator(subToggleSelector).first()
                            : listItem.locator('.subToggle').first());
                        const subMenuContainer = hasExplicitSubMenu ? subMenuLocator.first() : null;

                        const ensureSubMenuVisible = async () => {
                            if (subMenuContainer && await subMenuContainer.isVisible()) {
                                return;
                            }

                            if (subToggle && await subToggle.count()) {
                                try {
                                    await subToggle.click({ timeout: 3000 });
                                } catch {
                                    await parentLink.click({ timeout: 3000 }).catch(() => {});
                                }
                            } else {
                                await parentLink.click({ timeout: 3000 }).catch(() => {});
                            }

                            if (subMenuContainer) {
                                await subMenuContainer.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {
                                    console.warn(`[${siteName}] WARN: Sub-menu for "${cleanItemText}" did not expand after toggle click.`);
                                });
                            }
                        };

                        await ensureSubMenuVisible();

                        // Collect all sub-links data before navigation to avoid stale references after navigation resets.
                        const subLinks = subMenuContainer
                            ? subMenuContainer.locator(subMenuLinkSelectorWithinContainer ?? subMenuLinkSelector)
                            : listItem.locator(subMenuLinkSelector); // Use project-specific selector
                        const subLinkCount = await subLinks.count();
                        const subLinkData: { text: string; href: string }[] = [];
                        
                        for (let j = 0; j < subLinkCount; j++) {
                            const subLink = subLinks.nth(j);
                            
                            subMenuText = await subLink.textContent() || '';
                            const subLinkHref = await subLink.getAttribute('href');
                            
                            // Clean sub-menu text (e.g., "Campionii Craciunului")
                            const cleanSubText = subMenuText.replace(/(\r\n|\n|\r|\s+)/gm, ' ').trim();
                            
                            const absoluteSubHref = buildAbsoluteUrl(baseURL, subLinkHref);

                            if (!cleanSubText || !absoluteSubHref || absoluteSubHref === baseURL + '#' || absoluteSubHref === '#') {
                                console.warn(`[${siteName}] ⚠️ WARN: Skipping sub-link "${cleanSubText || '(no text)'}" due to empty or placeholder href.`);
                                continue;
                            }

                            subLinkData.push({ text: cleanSubText, href: absoluteSubHref });
                        }

                        for (const { text: cleanSubText, href } of subLinkData) {

                            await test.step(`Sublink Check: [${cleanItemText} / ${cleanSubText}]`, async () => {
                                try {
                                    // 1. Navigate using the actual HREF
                                    const navResponse = await page.goto(href, { waitUntil: 'load', timeout: 30000 });
                                    
                                    // 2. Status Code Check
                                    const navStatusCode = navResponse?.status() || 0;
                                    if (navStatusCode < 200 || navStatusCode >= 300) {
                                        throw new Error(`Non-2xx status code: ${navStatusCode} at URL: ${href}`);
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
                                            logFailureToCsv(siteName, `H2.2 - Sublink H1`, 'H1 Content Mismatch', errorMsg, href);
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
                                        logFailureToCsv(siteName, `H2.2 - Sublink H1`, 'Missing H1 Element', errorMsg, href);
                                        // 🎯 FIX: Include failure in terminal output
                                        console.error(`[${siteName}] ❌ FAILED: Sub-link "${cleanSubText}" failed H1 validation (Missing H1).`);
                                        stepFailed = true;
                                    }

                                    // 4. Humanization
                                    await humanizePage(page);
                                    
                                    // 5. Go back to the homepage (Guaranteed return)
                                    await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 });
                                    await prepareMenuState();
                                    
                                } catch (error) {
                                    // Log fatal failure (503/Timeout/Crash)
                                    const errorDetails = error instanceof Error ? error.message.split('\n')[0] : 'Unknown error.';
                                    logFailureToCsv(siteName, `H2.2 - Sublink Redirect`, 'Nav/Status/Crash Fail', errorDetails, href);
                                    
                                    console.error(`[${siteName}] ❌ FAILED: Sub-link "${cleanSubText}" failed. Error: ${errorDetails}`);
                                    stepFailed = true;
                                    
                                    // CRITICAL RECOVERY: Ensure return to homepage on failure to stabilize the browser
                                    try {
                                        await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 });
                                        await prepareMenuState();
                                    } catch (recoverError) {
                                        console.warn(`[${siteName}] CRITICAL WARNING: Failed to reset page state after error. Resuming test loop...`);
                                    }
                                }
                            });
                        } // End of collected subLinks loop

                    } else { 
                        // --- Direct Link Logic (Rule 2) ---
                        const linkHref = await parentLink.getAttribute('href');
                        
                        // 🎯 FIX: Smart URL Construction
                        targetUrl = buildAbsoluteUrl(baseURL, linkHref);


                        await test.step(`Direct Link Check: [${cleanItemText}]`, async () => {
                            try {
                                // 🎯 CHECK: If the link is just a placeholder (common for non-dropdowns that don't need linking)
                                if (!targetUrl || targetUrl === '#' || targetUrl === baseURL + '#' || targetUrl === baseURL + '/') { 
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
                                await prepareMenuState();
                                
                            } catch (error) {
                                // Log failure and attempt recovery (for 503/Timeout/Crash)
                                const errorDetails = error instanceof Error ? error.message.split('\n')[0] : 'Unknown error.';
                                logFailureToCsv(siteName, 'H2.2 - Direct Link Nav', 'Nav/Status/Crash Fail', errorDetails, targetUrl!);
                                console.error(`[${siteName}] ❌ FAILED: Direct link "${cleanItemText}" failed. Error: ${errorDetails}`);
                                stepFailed = true;
                                
                                try {
                                    await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 });
                                } catch (recoverError) {
                                    console.warn(`[${siteName}] CRITICAL WARNING: Failed to reset page state after error.`);
                                } finally {
                                    await prepareMenuState();
                                }
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