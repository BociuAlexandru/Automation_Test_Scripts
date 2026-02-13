import { devices, expect, Locator, Page, test } from '@playwright/test';
import * as fs from 'fs';
import path from 'path';

// --- DEVICE SETUP -----------------------------------------------------------
// Set up iPhone 13 device descriptor for mobile testing.

const { defaultBrowserType: _ignored, ...iPhone13Descriptor } = devices['iPhone 13'];

test.use({
    ...iPhone13Descriptor,
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    permissions: ['geolocation'],
    ignoreHTTPSErrors: true,
});

// --- CONSTANTS --------------------------------------------------------------
// Supercazino mobile selectors + logging knobs shared across helpers.

const BASE_URL = 'https://www.supercazino.ro/sloturi-gratis/'; // Base URL for Supercazino mobile.
const SUPPORTED_PROJECTS = new Set(['supercazino']); // Supported projects for this test.

const SEARCH_PHRASE = 'Sizzling Hot Deluxe'; // Search phrase for testing.
const VERBOSE_LOGGING = false; // Enable verbose logging for debugging.

const CSV_FAILURE_DIR = path.join(process.cwd(), 'failures'); // Directory for CSV failure logs.
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-'); // Timestamp for CSV file naming.
const CSV_HEADER = 'Project,Step,Details,URL,Error Message\n'; // CSV header for failure logs.

const SEARCH_CONTAINER_SELECTOR = '#ajaxsearchlite1'; // Container for the AJAX search widget.
const SEARCH_INPUT_SELECTOR = `${SEARCH_CONTAINER_SELECTOR} form[role="search"] input.orig[aria-label="Search input"]`; // Search input selector.
const SEARCH_MAGNIFIER_SELECTOR = `${SEARCH_CONTAINER_SELECTOR} button.promagnifier`; // Search magnifier button for mobile.
const FIRST_RESULT_SELECTOR = 'a.mb-3[href*="sizzling-hot-deluxe"]'; // First search result selector.
const DEMO_CTA_SELECTOR = 'a.btn.btn--1.border-0.iframeBtn'; // Demo CTA selector.
const CLOSE_POPUP_SELECTOR = 'svg.close-modal'; // Close popup selector.
const DEMO_IFRAME_SELECTOR = 'iframe[src*="gamelaunch.everymatrix.com"]'; // Demo iframe selector.
const COOKIE_ALLOW_ALL_SELECTOR = '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll'; // Cookie allow all selector.
const COOKIE_GENERIC_ACCEPT_SELECTOR = '#CybotCookiebotDialogBodyButtonAccept'; // Cookie generic accept selector.
const COOKIE_IFRAME_SELECTOR = 'iframe[id*="CybotCookiebotDialog"], iframe[src*="cookiebot"]'; // Cookie iframe selector.
const STICKY_OFFER_CLOSE_SELECTOR = '#close-fixed-offer'; // Sticky offer close selector.
const NEWSLETTER_CLOSE_SELECTOR =
    '.CloseButton__ButtonElement-sc-79mh24-0.springfield-CloseButton.springfield-close.springfield-ClosePosition--top-left'; // Newsletter close selector.

// --- HELPERS ----------------------------------------------------------------
// Popup dismissal, human typing, back-navigation, and CSV logging utilities.

const randomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min; // Generate random delay.

const verboseLog = (...args: unknown[]) => {
    if (VERBOSE_LOGGING) {
        console.log(...args);
    }
}; // Log verbose messages.

const verboseWarn = (...args: unknown[]) => {
    if (VERBOSE_LOGGING) {
        console.warn(...args);
    }
}; // Log verbose warnings.

const normalizeUrl = (input: string) => {
    try {
        const url = new URL(input);
        url.hash = '';
        url.search = '';
        if (!url.pathname.endsWith('/')) {
            url.pathname += '/';
        }
        return url.toString();
    } catch {
        return input;
    }
}; // Normalize URL.

const clickIfVisible = async (locator: Locator) => {
    if ((await locator.count()) === 0) {
        return false;
    }

    const candidate = locator.first();
    if (!(await candidate.isVisible().catch(() => false))) {
        return false;
    }

    return candidate
        .click({ delay: randomDelay(40, 120) })
        .then(() => true)
        .catch(() => false);
}; // Click element if visible.

const acceptCookiesIfPresent = async (page: Page) => {
    const selectors = [
        COOKIE_ALLOW_ALL_SELECTOR,
        COOKIE_GENERIC_ACCEPT_SELECTOR,
        'button:has-text("Acceptă")',
        'button:has-text("Accept")',
    ];

    for (const selector of selectors) {
        if (await clickIfVisible(page.locator(selector))) {
            return true;
        }
        const iframeButton = page.frameLocator(COOKIE_IFRAME_SELECTOR).locator(selector);
        if (await clickIfVisible(iframeButton)) {
            return true;
        }
    }

    return false;
}; // Accept cookies if present.

const closeStickyOfferIfPresent = (page: Page) => clickIfVisible(page.locator(STICKY_OFFER_CLOSE_SELECTOR)); // Close sticky offer if present.

const closeNewsletterIfPresent = (page: Page) => clickIfVisible(page.locator(NEWSLETTER_CLOSE_SELECTOR)); // Close newsletter if present.

const handleAmbientPopups = async (page: Page) => {
    // Best effort: never wait for these popups; dismiss only if visible.
    await acceptCookiesIfPresent(page);
    await closeStickyOfferIfPresent(page);
    await closeNewsletterIfPresent(page);
}; // Handle ambient popups.

const typeLikeHuman = async (locator: Locator, text: string) => {
    const input = locator.first();
    await input.waitFor({ state: 'visible', timeout: 15000 });
    await input.scrollIntoViewIfNeeded().catch(() => null);
    await input.focus().catch(() => null);
    await input.click({ delay: randomDelay(80, 140) });
    await input.fill('');
    for (const char of text) {
        await input.type(char, { delay: randomDelay(70, 140) });
    }
}; // Type text like a human.

const ensureSearchInputReady = async (page: Page) => {
    const container = page.locator(SEARCH_CONTAINER_SELECTOR).first();
    await container.waitFor({ state: 'attached', timeout: 15000 }).catch(() => null);
    await container.scrollIntoViewIfNeeded().catch(() => null);

    const searchInput = page.locator(SEARCH_INPUT_SELECTOR).first();
    await searchInput.waitFor({ state: 'attached', timeout: 15000 });

    let isVisible = await searchInput.isVisible().catch(() => false);
    if (!isVisible) {
        const magnifier = page.locator(SEARCH_MAGNIFIER_SELECTOR).first();
        if ((await magnifier.count()) > 0 && (await magnifier.isVisible().catch(() => false))) {
            await magnifier.click({ delay: randomDelay(60, 110), force: true }).catch(() => null);
            await page.waitForTimeout(200);
            isVisible = await searchInput.isVisible().catch(() => false);
        }
    }

    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await searchInput.scrollIntoViewIfNeeded().catch(() => null);
    return searchInput;
};

const forceSameTabNavigation = async (locator: Locator) => {
    await locator.evaluate((node) => {
        if (node instanceof HTMLAnchorElement) {
            node.target = '_self';
            node.rel = 'noopener noreferrer';
        }
    });
}; // Force same tab navigation.

const ensureReturnToListPage = async (page: Page, baseUrl: string) => {
    const target = normalizeUrl(baseUrl);
    if (page.isClosed()) {
        return;
    }
    if (normalizeUrl(page.url()).startsWith(target)) {
        return;
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
        if (page.isClosed()) {
            return;
        }
        await page.goBack({ waitUntil: 'commit', timeout: 8000 }).catch(() => null);
        await page.waitForTimeout(300);
        if (normalizeUrl(page.url()).startsWith(target)) {
            return;
        }
    }

    await page
        .goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
        .then(() => page.waitForLoadState('networkidle').catch(() => null))
        .catch((error) => {
            throw error;
        });
}; // Ensure return to list page.

const csvEscape = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ');
    return `"${str}"`;
}; // Escape CSV values.

const getCsvFilePath = (projectName: string) =>
    path.join(CSV_FAILURE_DIR, `${projectName}_p1-games-list-search-SC-mobile_${RUN_TIMESTAMP}.csv`); // Get CSV file path.

const ensureCsvInitialized = (projectName: string) => {
    if (!fs.existsSync(CSV_FAILURE_DIR)) {
        fs.mkdirSync(CSV_FAILURE_DIR, { recursive: true });
    }
    const csvPath = getCsvFilePath(projectName);
    if (!fs.existsSync(csvPath)) {
        fs.writeFileSync(csvPath, CSV_HEADER, { encoding: 'utf8' });
    }
    return csvPath;
}; // Ensure CSV initialization.

const appendFailureRow = (projectName: string, csvRow: string) => {
    const csvPath = ensureCsvInitialized(projectName);
    fs.appendFileSync(csvPath, `${csvRow}\n`, { encoding: 'utf8' });
}; // Append failure row to CSV.

const logStepFailure = (projectName: string, stepName: string, details: string, page: Page, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    let currentUrl = 'about:blank';
    try {
        currentUrl = page.url();
    } catch {
        // ignore
    }
    const csvRow = [
        csvEscape(projectName),
        csvEscape(stepName),
        csvEscape(details),
        csvEscape(currentUrl),
        csvEscape(message),
    ].join(',');
    appendFailureRow(projectName, csvRow);
}; // Log step failure.

const logStepStatus = (stepName: string, passed: boolean) => {
    const prefix = passed ? '✅' : '❌';
    console.log(`${prefix} ${stepName}`);
}; // Log step status.

const runAuditedStep = async (
    page: Page,
    projectName: string,
    stepName: string,
    action: () => Promise<void>,
) => {
    await test.step(stepName, async () => {
        try {
            await action();
            logStepStatus(stepName, true);
        } catch (error) {
            logStepFailure(projectName, stepName, `Failed during ${stepName}`, page, error);
            logStepStatus(stepName, false);
            throw error;
        }
    });
}; // Run audited step.

// --- TEST -------------------------------------------------------------------
// P1 Mobile: SC slot search and demo flow test.

test('P1 Mobile: SC slot search and demo flow', async ({ page }, testInfo) => {
    const currentProject = testInfo.project.name;
    if (currentProject && !SUPPORTED_PROJECTS.has(currentProject)) {
        test.skip(true, `SC mobile spec only runs for: ${Array.from(SUPPORTED_PROJECTS).join(', ')}`);
        return;
    }
    const projectName = currentProject ?? 'p1-games-list-search-SC-mobile';

    // Step 1: Load initial URL
    await runAuditedStep(page, projectName, '1. Load SC slot list', async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
        await handleAmbientPopups(page);
        verboseLog('Loaded SC slot list and cleared popups.');
    });

    // Step 2: Scroll until search field is visible
    await runAuditedStep(page, projectName, '2. Scroll to search field', async () => {
        await ensureSearchInputReady(page);
        await handleAmbientPopups(page);
        verboseLog('Search input is in viewport.');
    });

    // Step 3: Enter search phrase and submit with Enter
    await runAuditedStep(page, projectName, '3. Enter search phrase and submit', async () => {
        const searchInput = await ensureSearchInputReady(page);
        await typeLikeHuman(searchInput, SEARCH_PHRASE);
        await handleAmbientPopups(page);
        await searchInput.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000);
        verboseLog('Search submitted.');
    });

    // Step 4: Click first search result
    await runAuditedStep(page, projectName, '4. Open first search result', async () => {
        const firstResult = page.locator(FIRST_RESULT_SELECTOR).first();
        await firstResult.waitFor({ state: 'visible', timeout: 10000 });
        await firstResult.scrollIntoViewIfNeeded();

        await forceSameTabNavigation(firstResult);
        await Promise.all([
            page.waitForURL(/\/joc-slot\/.+/, { timeout: 15000 }),
            page.waitForLoadState('domcontentloaded'),
            firstResult.click({ delay: randomDelay(70, 140) }),
        ]);
        await page.waitForTimeout(800);
        await handleAmbientPopups(page);
        verboseLog('Navigated to slot details page.');
    });

    // Step 5: Click JOACA GRATIS CTA to open demo
    await runAuditedStep(page, projectName, '5. Launch demo popup', async () => {
        const maxAttempts = 4;
        const popupIframe = page.locator(DEMO_IFRAME_SELECTOR).first();

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const demoButton = page
                .locator(DEMO_CTA_SELECTOR)
                .filter({ hasText: /joac[aă]\s+gratis/i })
                .first();

            await expect(demoButton).toBeVisible({ timeout: 10000 });
            await demoButton.scrollIntoViewIfNeeded();
            await demoButton.click({ delay: randomDelay(70, 140) });

            try {
                await popupIframe.waitFor({ state: 'visible', timeout: 7000 });
                verboseLog(`Demo popup detected on attempt ${attempt}/${maxAttempts}.`);
                break;
            } catch {
                if (attempt === maxAttempts) {
                    throw new Error('Demo popup did not appear after multiple attempts.');
                }
                await handleAmbientPopups(page);
                verboseWarn(`Demo popup not detected on attempt ${attempt}. Retrying...`);
            }
        }
        verboseLog('Demo popup opened.');
    });

    // Step 6: Wait for demo to load fully (3-4 seconds)
    await runAuditedStep(page, projectName, '6. Wait for demo to load', async () => {
        const waitTime = randomDelay(3000, 4000);
        await page.waitForTimeout(waitTime);
        verboseLog(`Waited ${waitTime}ms for demo load.`);
    });

    // Step 7: Close popup
    await runAuditedStep(page, projectName, '7. Close demo popup', async () => {
        const closeButton = page.locator(CLOSE_POPUP_SELECTOR).first();
        await expect(closeButton).toBeVisible({ timeout: 10000 });
        await closeButton.click({ delay: randomDelay(60, 120) });
        await expect(closeButton).toBeHidden({ timeout: 10000 });
        await page.waitForTimeout(500);
        verboseLog('Demo popup closed.');
    });

    // Step 8: Return to initial URL
    await runAuditedStep(page, projectName, '8. Return to slot list', async () => {
        await ensureReturnToListPage(page, BASE_URL);
        await expect(page).toHaveURL(BASE_URL, { timeout: 10000 });
        verboseLog('Back on SC slot list.');
    });
});