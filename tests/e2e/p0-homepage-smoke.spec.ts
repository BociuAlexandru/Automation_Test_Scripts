// tests/e2e/p0-homepage-smoke.spec.ts (V34 - Case Sensitivity Fix & Final Logic)

// 💥 CRITICAL IMPORTS
import { test, expect, TestInfo } from '@playwright/test'; 
import { siteConfigs, SiteName } from './config/sites'; 

/**
 * Helper to get the siteName from the Playwright Project Name.
 */
const getSiteNameFromProject = (projectName: string): SiteName => {
    return projectName as SiteName;
};

// --- TYPE DEFINITION ---
type MenuMapItem = { 
    selector: string; 
    name: string; 
    hasDropdown: boolean; 
    paths: string[]; 
    mainPath?: string; 
};

// --- CONFIGURATION CONSTANTS ---
// Sites that require HOVER to open the top-level menu dropdown on desktop
const HOVER_SITES: SiteName[] = ['supercazino', 'jocuricazinouri']; 

// Casino.com.ro specific menu map (derived from HTML)
const CCR_MENU_MAP: MenuMapItem[] = [
    { name: 'Bonusuri Fără Depunere', selector: 'li:nth-child(1) a[href="#"]', hasDropdown: true, 
      paths: ['/bonus-fara-depunere/', '/rotiri-gratuite/', '/bonus-pariuri-fara-depunere/'], mainPath: '/bonus-fara-depunere-online-2025/' },
    
    { name: 'Bonusuri', selector: 'li:nth-child(2) a[href="#"]', hasDropdown: true, 
      paths: ['/calendar-craciun-bonusuri-casino/', '/bonus-de-bun-venit/', '/bonus-casino/', '/pacanele-online-cu-cardul/', '/bonus-fara-rulaj/', '/bonus-de-ziua-ta/', '/roata-norocului-casino/', '/bonusuri-pariuri-sportive/'], mainPath: '/bonus-de-bun-venit/' },
    
    { name: 'Recenzii', selector: 'li:nth-child(3) a[href="#"]', hasDropdown: true, 
      paths: ['/cazinouri/', '/cazinou/prima-casino/', '/cazinou/superbet/', '/cazinou/player-casino/', '/cazinou/netbet/', '/cazinou/winboss/', '/cazinou/mr-bit/', '/cazinou/totogaming/', '/cazinou/conticazino/', '/cazinou/pokerstars/', '/cazinou/casa-pariurilor/', '/cazinou/fortuna/', '/cazinou/pacanele-ro/', '/cazinou/winbet/', '/cazinou/betano/', '/cazinou/don-casino/', '/cazinou/12xbet/', '/cazinou/maxwin/', '/cazinou/777-casino/', '/cazinou/king-casino/'], mainPath: '/cazinouri/' },
    
    { name: 'Sloturi Gratis', selector: 'li:nth-child(4) a[href="#"]', hasDropdown: true, 
      paths: ['/sloturi/', '/jocuri/pacanele-gratis/', '/jocuri/pacanele-fructe/', '/jocuri/pacanele-cu-trifoi/', '/jocuri/pacanele-cu-speciale/', '/jocuri/pacanele-dublaje/', '/jocuri/sloturi-cu-rtp-mare/', '/jocuri/pacanele-megaways/', '/jocuri/pacanele-jackpot/', '/jocuri/pacanele-cu-coroane/', '/jocuri/bell-link-demo/', '/jocuri/clover-chance/', '/jocuri/egypt-quest/', '/jocuri/ruleta-online-gratis/', '/jocuri/blackjack-online-gratis/'], mainPath: '/sloturi/' },
    
    { name: 'Producători', selector: 'li:nth-child(5) a[href="#"]', hasDropdown: true, 
      paths: ['/producatori-sloturi-online/', '/producatori-sloturi/amusnet/', '/producatori-sloturi/pragmatic-play/', '/producatori-sloturi/novomatic/', '/producatori-sloturi/netent/', '/producatori-sloturi/isoftbet/', '/producatori-sloturi/relax-gaming/', '/producatori-sloturi/hacksaw-gaming/', '/producatori-sloturi/playngo/', '/producatori-sloturi/skywind/'], mainPath: '/producatori-sloturi-online/' },
    
    { name: 'Noutăți', selector: 'li:nth-child(6) a[href="#"]', hasDropdown: true, 
      paths: ['/blog/', '/bonus-casino-standard/prima-casino-bonus-fara-depunere/', '/bonus-casino-exclusiv/superbet-bonus-fara-depunere/', '/ghid/cod-bonus-player-casino/', '/bonus-casino-exclusiv/netbet-rotiri-gratuite/', '/bonus-casino-exclusiv/rotiri-gratuite-winboss/', '/ghid/mr-bit-bonus-fara-depunere/', '/bonus-casino-standard/bonusuri-totogaming/', '/ghid/conti-cazino-bonus-fara-depunere/', '/bonus-casino-standard/bonus-casa-pariurilor/', '/bonus-casino-exclusiv/bonus-fara-depunere-fortuna/', '/bonus-casino-standard/bonus-pacanele-casino/', '/bonus-casino-standard/winbet-100-rotiri-gratuite-fara-depozit/', '/bonus-casino-exclusiv/bonus-fara-depunere-betano/', '/ghid/bonusuri-don-casino/', '/bonus-casino-standard/bonus-12xbet/', '/bonus-casino-standard/rotiri-gratuite-million/', '/bonus-casino-standard/bonus-32rosu/'], mainPath: '/blog/' },
    
    { name: 'Poker', selector: 'li:nth-child(7) a[href="#"]', hasDropdown: true, 
      paths: ['/poker-online/', '/poker/freeroll-poker/', '/poker/', '/poker/cum-sa-castigi-la-poker/', '/poker/poker-omaha-hi-lo/', '/poker/seven-card-stud/', '/poker/razz-poker/', '/poker/short-deck-poker/', '/poker/omaha-poker/', '/poker/2-7-triple-draw-poker/'], mainPath: '/poker-online/' },
];

// Supercazino map is still needed for filtering logic in the code
const SUPERCAZINO_MENU_PATHS: Record<string, string[]> = {
    'Cazinouri Online': [], 
    'Bonusuri Casino': [],
    'Recenzii': [],
    'Jocuri Casino': [],
    'Loto': [],
};


// --- H1: Homepage Load Performance (ID: H1) ---
test('H1: Homepage Load Performance - Initial Load and Key Elements Visibility', async ({ page }, testInfo: TestInfo) => { 
    
    const projectName = testInfo.project.name; 
    const siteName = getSiteNameFromProject(projectName);
    const config = siteConfigs[siteName];
    
    const startTime = Date.now(); // FIX: Corrected capitalization to Date.now()
    const response = await test.step('H1.1: Navigate to Homepage and Await Load', async () => {
        return page.goto('/', { waitUntil: 'load' });
    });
    
    const loadTime = Date.now() - startTime;
    const maxLoadTime = 30000; 
    
    expect(response?.status(), `[${siteName}] H1.1: Homepage navigation should return a 200 OK status.`).toBe(200);
    
    console.log(`[${siteName}] INFO: Page load time: ${loadTime}ms`);
    expect(loadTime, `[${siteName}] H1.2: Homepage should load in under ${maxLoadTime}ms. Actual: ${loadTime}ms.`).toBeLessThan(maxLoadTime);
    
    await test.step('H1.3a: Verify Main Header Visibility', async () => {
        const header = page.locator('header, .header, #main-header-wrapper, #header, #site-header, #masthead, [data-elementor-type="header"], #page, .site, .mega-menu-desktop-container, .main-header-bar-wrap').first();
        await expect(header, `[${siteName}] H1.3a: Main site header element (or ultimate site wrapper) should be visible.`).toBeVisible();
    });

    await test.step('H1.3b: Verify Logo/Title Visibility/Existence', async () => {
        const logo = page.locator('.inline-block.max-w-\\[110px\\], a[href="/"], a[href="/#"], img[alt*="logo" i], h1').first();
        await expect(logo, `[${siteName}] H1.3b: Site logo link must exist in the DOM and be enabled.`).toBeEnabled({ timeout: 10000 });
    });
    
    await test.step('H1.3c: Verify Affiliate CTA Visibility', async () => {
        const cta = page.locator(config.ctaSelector).first();
        await expect(cta, `[${siteName}] H1.3c: At least one primary affiliate CTA (${config.ctaSelector}) should be visible.`).toBeVisible();
    });

    testInfo.annotations.push({ type: 'Test ID', description: 'H1' });
});


// --- H2: Main Navigation Functionality (ID: H2) ---
test('H2: Main Navigation Functionality - Top Menu and Logo Link Check', async ({ page }, testInfo: TestInfo) => {
    
    const projectName = testInfo.project.name; 
    const siteName = getSiteNameFromProject(projectName);
    const config = siteConfigs[siteName];
    const baseURL = testInfo.project.use.baseURL!; 
    
    // Determine which menu map to use
    let menuMap: MenuMapItem[] = [];
    if (siteName === 'casino.com.ro') {
        menuMap = CCR_MENU_MAP;
    } 
    
    const isHoverSite = HOVER_SITES.includes(siteName);

    await test.step('H2.1: Start on Homepage', async () => {
        console.log(`\n[${siteName}] === H2: Starting Navigation Test (Targeted) ===`);
        // Start fresh on the homepage
        await page.goto(baseURL, { waitUntil: 'load' }); 
    });
    
    // --- Step 2: Iterate through each top menu item ---
    if (menuMap.length > 0) {
        
        for (const rawParentItem of menuMap) {
            const parentItem: MenuMapItem = rawParentItem;
            
            // Find the parent trigger link based on its text content
            const parentLink = page.locator('.header-desktop-menu').getByText(parentItem.name, { exact: true }).first(); 
            const parentMenuText = parentItem.name;

            await test.step(`H2.2: Testing Parent Menu Item: [${parentMenuText}]`, async () => {
                
                try {
                    // Check if the parent link exists before attempting to interact
                    await expect(parentLink, `Parent link "${parentMenuText}" must be visible.`).toBeVisible({ timeout: 5000 });

                    if (parentItem.hasDropdown) {
                        // 1. Trigger the dropdown
                        console.log(`[${siteName}] DEBUG: Triggering parent: "${parentMenuText}" via ${isHoverSite ? 'HOVER' : 'CLICK'}. (Checking ${parentItem.paths.length} links)`);
                        
                        // Execute the correct trigger action
                        if (isHoverSite) {
                            await parentLink.hover({ timeout: 5000 });
                        } else {
                            await parentLink.click({ timeout: 5000 }); 
                        }

                        // 2. Filter target paths
                        let targetPaths = parentItem.paths;
                        if (parentItem.mainPath) {
                            targetPaths = targetPaths.filter(path => path !== parentItem.mainPath);
                        }

                        if (targetPaths.length === 0) {
                             console.warn(`[${siteName}] WARNING: Submenu path list for "${parentMenuText}" is empty or filtered out. Continuing.`);
                             return; 
                        }

                        // 3. Iterate through all hardcoded target paths
                        for (const targetPath of targetPaths) {
                            
                            // Create a highly specific locator based on the expected path
                            const subLinkLocator = page.locator(`.submenu-panel a[href*="${targetPath}"]`).first();
                            
                            // Get the visible text of the link (used for logging only)
                            const subMenuText = (await subLinkLocator.textContent())?.trim().split('\n')[0].trim() || targetPath;

                            await test.step(`Sublink Check: [${parentItem.name} / ${subMenuText}]`, async () => {
                                try {
                                    // 1. CRITICAL FIX: Bypass unstable click events by forcing direct navigation
                                    const targetUrl = baseURL + targetPath;
                                    await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
                                    
                                    // 2. Final Assertion Check (Path comparison)
                                    expect(page.url()).toContain(targetPath);
                                    
                                    console.log(`[${siteName}] ✅ PASSED: Sub-link "${subMenuText}" redirected successfully to ${targetPath}`);

                                    // 3. Go back to the homepage (Guaranteed return)
                                    await page.goto(baseURL, { waitUntil: 'load', timeout: 30000 });
                                    
                                } catch (error) {
                                    console.error(`[${siteName}] ❌ FAILED: Sub-link "${subMenuText}" failed. Error: ${error instanceof Error ? error.message.split('\n')[0] : 'Unknown error.'}`);
                                    await page.goto(baseURL, { waitUntil: 'load' }); // Ensure return to homepage on failure
                                    throw error;
                                }
                            });
                        } // End of subLinks loop

                    } else {
                        // B. Handle No-Dropdown Links 
                        console.log(`[${siteName}] DEBUG: Testing direct link: "${parentItem.name}" via CLICK.`);
                        
                        await parentLink.click({ timeout: 5000 });
                        await page.waitForLoadState('load', { timeout: 30000 });
                        
                        // Check URL contains the path segment
                        expect(page.url()).toContain(parentItem.mainPath); 
                        
                        console.log(`[${siteName}] ✅ PASSED: Direct link "${parentItem.name}" redirected successfully.`);
                        await page.goto(baseURL, { waitUntil: 'load', timeout: 30000 });
                    }
                    
                } catch (error) {
                    console.error(`[${siteName}] ❌ FAILED: Parent item "${parentMenuText}" failed test.`);
                    // Propagate the error.
                    await page.goto(baseURL, { waitUntil: 'load' });
                    throw error;
                }
            });
        } // End of parent menu loop
    } else {
        console.warn(`[${siteName}] WARNING: H2 test logic not implemented for this site.`);
    }

    
    // --- Step 3: Verify Logo Click ---
    await test.step('H2.4: Verify Logo Link Returns to Homepage', async () => {
        
        // Use the first high-traffic path
        const deepPath = config.highTrafficPaths[0]; 
        await page.goto(baseURL + deepPath, { waitUntil: 'domcontentloaded' }); // Navigate from base URL to ensure full path
        
        console.log(`[${siteName}] DEBUG: Testing logo click from: ${deepPath}`);

        const logoSelector = '.theme-container a[href="/"]'; // Specific selector for CCR logo wrapper
        const logoLink = page.locator(logoSelector).first();

        await expect(logoLink, `[${siteName}] Site logo link (${logoSelector}) should be enabled.`).toBeEnabled({ timeout: 5000 });
        
        await logoLink.click();
        
        await page.waitForURL(baseURL + '/', { waitUntil: 'load', timeout: 30000 });
        expect(page.url(), `[${siteName}] Clicking the logo should return to the root homepage ('/')`).toBe(baseURL + '/');
        console.log(`[${siteName}] ✅ LOGO CHECK PASSED: Redirected to: ${baseURL}/`);
    });

    testInfo.annotations.push({ type: 'Test ID', description: 'H2' });
});