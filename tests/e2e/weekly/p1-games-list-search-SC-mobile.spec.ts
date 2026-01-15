import { devices, expect, Locator, Page, test } from '@playwright/test';
import * as fs from 'fs';
import path from 'path';

// --- DEVICE SETUP -----------------------------------------------------------
const { defaultBrowserType: _ignored, ...iPhone13Descriptor } = devices['iPhone 13'];

test.use({
    ...iPhone13Descriptor,
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    permissions: ['geolocation'],
    ignoreHTTPSErrors: true,
});

// --- CONSTANTS --------------------------------------------------------------
const BASE_URL = 'https://www.supercazino.ro/sloturi-gratis/';
const SUPPORTED_PROJECTS = new Set(['supercazino']);

const SEARCH_PHRASE = 'Sizzling Hot Deluxe';
const VERBOSE_LOGGING = false;
const CSV_FAILURE_DIR = path.join(process.cwd(), 'failures');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const CSV_HEADER = 'Project,Step,Details,URL,Error Message\n';

const SEARCH_INPUT_SELECTOR = 'form[role="search"] input.orig[aria-label="Search input"]';
const FIRST_RESULT_SELECTOR = 'a.mb-3[href*="sizzling-hot-deluxe"]';
const DEMO_CTA_SELECTOR = 'a.btn.btn--1.border-0.iframeBtn';
const CLOSE_POPUP_SELECTOR = 'svg.close-modal';
const DEMO_IFRAME_SELECTOR = 'iframe[src*="gamelaunch.everymatrix.com"]';

const COOKIE_ALLOW_ALL_SELECTOR = '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll';
const COOKIE_GENERIC_ACCEPT_SELECTOR = '#CybotCookiebotDialogBodyButtonAccept';
const COOKIE_IFRAME_SELECTOR = 'iframe[id*="CybotCookiebotDialog"], iframe[src*="cookiebot"]';
const STICKY_OFFER_CLOSE_SELECTOR = '#close-fixed-offer';
const NEWSLETTER_CLOSE_SELECTOR =
    '.CloseButton__ButtonElement-sc-79mh24-0.springfield-CloseButton.springfield-close.springfield-ClosePosition--top-left';

// --- HELPERS ----------------------------------------------------------------
const randomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const verboseLog = (...args: unknown[]) => {
    if (VERBOSE_LOGGING) {
        console.log(...args);
    }
};

const verboseWarn = (...args: unknown[]) => {
    if (VERBOSE_LOGGING) {
        console.warn(...args);
    }
};

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
};

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
};

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
};

const closeStickyOfferIfPresent = (page: Page) => clickIfVisible(page.locator(STICKY_OFFER_CLOSE_SELECTOR));

const closeNewsletterIfPresent = (page: Page) => clickIfVisible(page.locator(NEWSLETTER_CLOSE_SELECTOR));

const handleAmbientPopups = async (page: Page) => {
    // Best effort: never wait for these popups; dismiss only if visible.
    await acceptCookiesIfPresent(page);
    await closeStickyOfferIfPresent(page);
    await closeNewsletterIfPresent(page);
};

const typeLikeHuman = async (locator: Locator, text: string) => {
    const input = locator.first();
    await input.waitFor({ state: 'visible', timeout: 15000 });
    await input.scrollIntoViewIfNeeded();
    await input.click({ delay: randomDelay(80, 140) });
    await input.fill('');
    for (const char of text) {
        await input.page().keyboard.type(char, { delay: randomDelay(70, 150) });
    }
};

const forceSameTabNavigation = async (locator: Locator) => {
    await locator.evaluate((node) => {
        if (node instanceof HTMLAnchorElement) {
            node.target = '_self';
            node.rel = 'noopener noreferrer';
        }
    });
};

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
};

const csvEscape = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ');
    return `"${str}"`;
};

const getCsvFilePath = (projectName: string) =>
    path.join(CSV_FAILURE_DIR, `${projectName}_p1-games-list-search-SC-mobile_${RUN_TIMESTAMP}.csv`);

const ensureCsvInitialized = (projectName: string) => {
    if (!fs.existsSync(CSV_FAILURE_DIR)) {
        fs.mkdirSync(CSV_FAILURE_DIR, { recursive: true });
    }
    const csvPath = getCsvFilePath(projectName);
    if (!fs.existsSync(csvPath)) {
        fs.writeFileSync(csvPath, CSV_HEADER, { encoding: 'utf8' });
    }
    return csvPath;
};

const appendFailureRow = (projectName: string, csvRow: string) => {
    const csvPath = ensureCsvInitialized(projectName);
    fs.appendFileSync(csvPath, `${csvRow}\n`, { encoding: 'utf8' });
};

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
};

const logStepStatus = (stepName: string, passed: boolean) => {
    const prefix = passed ? '✅' : '❌';
    console.log(`${prefix} ${stepName}`);
};

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
};

// --- TEST -------------------------------------------------------------------
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
        const searchInput = page.locator(SEARCH_INPUT_SELECTOR);
        if ((await searchInput.count()) === 0) {
            await page.evaluate(() => window.scrollTo({ top: 450, behavior: 'instant' }));
        }
        await searchInput.first().scrollIntoViewIfNeeded().catch(() => null);
        await handleAmbientPopups(page);
        verboseLog('Search input is in viewport.');
    });

    // Step 3: Enter search phrase and submit with Enter
    await runAuditedStep(page, projectName, '3. Enter search phrase and submit', async () => {
        const searchInput = page.locator(SEARCH_INPUT_SELECTOR);
        await typeLikeHuman(searchInput, SEARCH_PHRASE);
        await handleAmbientPopups(page);
        await page.keyboard.press('Enter');
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