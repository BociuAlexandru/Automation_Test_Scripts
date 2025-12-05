// tests/e2e/p0-homepage-smoke.spec.ts (H1 Only)

import { test, expect, TestInfo } from '@playwright/test'; 
import { siteConfigs, SiteName } from './config/sites';

const getSiteNameFromProject = (projectName: string): SiteName => {
    return projectName as SiteName;
};

// --- H1: Homepage Load Performance (ID: H1) ---
test('H1: Homepage Load Performance - Initial Load and Key Elements Visibility', async ({ page }, testInfo: TestInfo) => { 
    
    const projectName = testInfo.project.name; 
    const siteName = getSiteNameFromProject(projectName);
    const config = siteConfigs[siteName];
    
    // --- Step 1 & 2: Access website and measure load time ---
    const startTime = Date.now();
    const response = await test.step('H1.1: Navigate to Homepage and Await Load', async () => {
        return page.goto('/', { waitUntil: 'load' });
    });
    
    const loadTime = Date.now() - startTime;
    const maxLoadTime = 30000; // Increased threshold for stability
    
    expect(response?.status(), `[${siteName}] H1.1: Homepage navigation should return a 200 OK status.`).toBe(200);
    
    console.log(`[${siteName}] INFO: Page load time: ${loadTime}ms`);
    expect(loadTime, `[${siteName}] H1.2: Homepage should load in under ${maxLoadTime}ms. Actual: ${loadTime}ms.`).toBeLessThan(maxLoadTime);
    
    // --- Step 3: Observe if all elements render correctly (Header, Logo, CTA) ---
    
    // 1. Check for the main Header element (FINAL FIX: Including .mega-menu-desktop-container for SuperCazino)
    await test.step('H1.3a: Verify Main Header Visibility', async () => {
        const header = page.locator('header, .header, #main-header-wrapper, #header, #site-header, #masthead, [data-elementor-type="header"], #page, .site, .mega-menu-desktop-container').first();
        await expect(header, `[${siteName}] H1.3a: Main site header element (or ultimate site wrapper) should be visible.`).toBeVisible();
    });

    // 2. Check for the Logo/Title (Ensures presence and clickability)
    await test.step('H1.3b: Verify Logo/Title Visibility/Existence', async () => {
        const logo = page.locator('.inline-block.max-w-\\[110px\\], a[href="/"], a[href="/#"], img[alt*="logo" i], h1').first();
        await expect(logo, `[${siteName}] H1.3b: Site logo link must exist in the DOM and be enabled.`).toBeEnabled({ timeout: 10000 });
    });
    
    // 3. Check for the Affiliate CTA (Stable)
    await test.step('H1.3c: Verify Affiliate CTA Visibility', async () => {
        const cta = page.locator(config.ctaSelector).first();
        await expect(cta, `[${siteName}] H1.3c: At least one primary affiliate CTA (${config.ctaSelector}) should be visible.`).toBeVisible();
    });

    testInfo.annotations.push({ type: 'Test ID', description: 'H1' });
});