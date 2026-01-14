// File Path: tests/e2e/p1-games-list-search.spec.ts

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import path from 'path';

// --- PROJECT CONFIGURATION DATA ---
type ProjectConfig = {
    BASE_URL: string;
    SEARCH_PHRASE: string;
    SELECTORS: {
        SearchInput: string;
        SearchButton: string;
        FirstGameCard: string;
        DemoCTA: string;
        CloseButton: string;
        GameIframe: string;
    };
    BACK_STEPS: number;
};

type SupportedProject = 'supercazino';

const CONFIG: Record<SupportedProject, ProjectConfig> = {
    supercazino: {
        BASE_URL: "https://www.supercazino.ro/sloturi-gratis/",
        SEARCH_PHRASE: "Sizzling Hot Deluxe",
        SELECTORS: {
            SearchInput: 'input.orig',
            SearchButton: 'button#search-submit',
            FirstGameCard: '.card.border-0.article-card.relative > a',
            DemoCTA: 'a.iframeBtn',
            CloseButton: '.close-modal',
            GameIframe: 'iframe[src*="gamelaunch.everymatrix.com"]'
        },
        BACK_STEPS: 3
    }
};

const isSupportedProject = (name: string): name is SupportedProject => name in CONFIG;

const randomDelay = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const VERBOSE_LOGGING = false;
const CSV_FAILURE_DIR = path.join(process.cwd(), 'failures');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const CSV_HEADER = 'Project,Step,Details,URL,Error Message\n';

const verboseLog = (...args: unknown[]) => {
    if (VERBOSE_LOGGING) {
        console.log(...args);
    }
};

const normalizeUrl = (input: string) => {
    const url = new URL(input);
    url.hash = '';
    url.search = '';
    if (!url.pathname.endsWith('/')) {
        url.pathname += '/';
    }
    return url.toString();
};

const typeLikeHuman = async (page: Page, selector: string, text: string) => {
    const input = page.locator(selector);
    await input.waitFor({ state: 'visible' });
    await input.click({ delay: randomDelay(80, 150) });
    await input.fill('');
    for (const char of text) {
        await page.keyboard.type(char, { delay: randomDelay(90, 220) });
    }
};

const acceptCookiesIfPresent = async (page: Page) => {
    const selectors = [
        'button:has-text("Acceptă")',
        'button:has-text("Acceptă selecția")',
        'button:has-text("Accept")',
        'button:has-text("Accept selection")',
        'button:has-text("De acord")',
        '.cmplz-btn.cmplz-accept',
        '#cmplz-accept',
    ];

    for (const selector of selectors) {
        const button = page.locator(selector).first();
        if ((await button.count()) > 0 && (await button.isVisible())) {
            await button.click({ delay: randomDelay(50, 120) });
            await page.waitForTimeout(randomDelay(250, 400));
            verboseLog(`Cookies banner dismissed using selector: ${selector}`);
            return true;
        }
    }

    return false;
};

const csvEscape = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ');
    return `"${str}"`;
};

const getCsvFilePath = (projectName: string) =>
    path.join(CSV_FAILURE_DIR, `${projectName}_p1-games-list-search-SC-desktop_${RUN_TIMESTAMP}.csv`);

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

const ensureReturnToStart = async (page: Page, baseUrl: string, maxAttempts: number) => {
    const targetUrl = normalizeUrl(baseUrl);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const currentNormalized = normalizeUrl(page.url());
        if (currentNormalized.startsWith(targetUrl)) {
            return;
        }

        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
        await page.waitForTimeout(600);
        await page.waitForLoadState('domcontentloaded').catch(() => null);
    }

    const normalizedCurrent = normalizeUrl(page.url());
    if (!normalizedCurrent.startsWith(targetUrl)) {
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => null);
    }
};

const runAuditedStep = async <T>(
    page: Page,
    projectName: string,
    stepName: string,
    action: () => Promise<T>,
): Promise<T> => {
    return await test.step(stepName, async () => {
        try {
            const result = await action();
            logStepStatus(stepName, true);
            return result;
        } catch (error) {
            logStepFailure(projectName, stepName, `Failed during ${stepName}`, page, error);
            logStepStatus(stepName, false);
            throw error;
        }
    });
};

test('P1: Full Slot Game Search and Demo Flow', async ({ page }, testInfo) => {
    // --- DYNAMIC CONFIGURATION BLOCK ---
    // 1. Get the current running project name from the Playwright context
    const projectName = testInfo.project.name;

    if (!isSupportedProject(projectName)) {
        test.skip(true, `P1 Games List Search SC only runs for: ${Object.keys(CONFIG).join(', ')}`);
        return;
    }
    
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

    // --- STEP 1: Navigate to the specific URL (using dynamic BASE_URL) ---
    // Action: Use page.goto to navigate to the exact starting link.
    await runAuditedStep(page, projectName, `1. Navigate directly to the starting URL: ${BASE_URL}`, async () => {
        await page.goto(BASE_URL);
        await acceptCookiesIfPresent(page);
        verboseLog(`Navigated to: ${BASE_URL}`);
    });

    // --- STEP 2: Ensure the page loads and is scrollable ---
    // Action: Wait for stability and perform a scroll. No selector needed.
    await runAuditedStep(page, projectName, '2. Ensure page loads and scroll is correct', async () => {
        await page.waitForLoadState('networkidle');
        // Executes a small scroll to mimic user behavior and trigger lazy-loading
        await page.evaluate(() => window.scrollTo(0, 300));
        verboseLog('Page loaded and initial scroll performed.');
    });

    // --- STEP 3: Recognize the search bar and input the specific text 'Sizzling Hot Deluxe' ---
    // Action: Use page.fill with the SearchInput selector and the specific phrase.
    await runAuditedStep(page, projectName, `3. Enter specific search phrase: '${SEARCH_PHRASE}'`, async () => {
        await page.hover(SELECTORS.SearchInput);
        await page.waitForTimeout(randomDelay(200, 400));
        await typeLikeHuman(page, SELECTORS.SearchInput, SEARCH_PHRASE);
        verboseLog(`Entered specific search phrase like a human: ${SEARCH_PHRASE}`);
    });

    // --- STEP 4: Submit the search by pressing 'Enter' on the input field ---
    await runAuditedStep(page, projectName, '4. Submit the search by pressing Enter (Bug Workaround)', async () => {
        // Action: Use page.press on the input field to simulate pressing Enter
        // We are deliberately bypassing the bugged SearchButton click.
        await page.keyboard.press('Enter');

        // Crucial Wait: Wait for the URL to change or the results to load after submission
        await page.waitForLoadState('domcontentloaded'); 
        verboseLog('Search submitted by pressing Enter.');
    });

    
    // --- STEP 5: Click on the first game card to redirect to the Single Slot page ---
    await runAuditedStep(page, projectName, '5. Click on the first game card', async () => {
        const firstCard = page.locator(SELECTORS.FirstGameCard).first();
        await firstCard.waitFor({ state: 'visible' });

        await firstCard.evaluate((node: HTMLElement) => {
            if (node instanceof HTMLAnchorElement) {
                node.target = '_self';
                node.rel = 'noopener noreferrer';
            }
        });

        await Promise.all([
            page.waitForURL(/\/joc-slot\/.+/, { timeout: 15000 }),
            page.waitForLoadState('domcontentloaded'),
            firstCard.click({ delay: randomDelay(60, 140) })
        ]);

        await acceptCookiesIfPresent(page);
        await page.waitForTimeout(randomDelay(300, 500));
        verboseLog(`Clicked first game card and stayed on: ${page.url()}`);
    });

    // --- STEP 6: On the Single Slot page, click the CTA 'JOACĂ GRATIS' ---
    // Action: Use a human-like click on the Demo CTA selector and verify the popup opens.
    await runAuditedStep(page, projectName, '6. Click the Demo CTA to open the popup', async () => {
        const popupIframe = page.locator(SELECTORS.GameIframe).first();
        const maxAttempts = 4;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const demoCta = page
                .locator(SELECTORS.DemoCTA)
                .filter({ hasText: /joac[aă]\s+gratis/i })
                .filter({ hasNot: page.locator('[aria-hidden="true"]') })
                .first();

            await expect(demoCta).toBeVisible({ timeout: 10000 });

            await demoCta.scrollIntoViewIfNeeded();
            await demoCta.hover();
            await demoCta.click({ delay: randomDelay(60, 140) });

            try {
                await popupIframe.waitFor({ state: 'visible', timeout: 7000 });
                await page.waitForTimeout(3000);
                verboseLog(`Popup opened after clicking CTA (attempt ${attempt}/${maxAttempts}).`);
                return;
            } catch {
                verboseLog(`Popup not detected after attempt ${attempt}. Retrying...`);
                await page.waitForTimeout(randomDelay(400, 700));
            }
        }

        throw new Error("Demo CTA click did not open the popup after multiple attempts.");
    });

    // --- STEP 7: Wait for the demo game slot popup to fully load ---
    await runAuditedStep(page, projectName, '7. Wait for the demo game slot popup to fully load', async () => {
        const gameIframe = page.locator(SELECTORS.GameIframe).first();
        await expect(gameIframe).toBeVisible({ timeout: 20000 });

        const closeBtn = page.locator(SELECTORS.CloseButton).first();
        await expect(closeBtn).toBeVisible({ timeout: 20000 });
        await page.waitForTimeout(3000);
        verboseLog('Demo game popup appears to be fully loaded.');
    });

    // --- STEP 8: Recognize the close button and click it to close the popup ---
    // Action: Use page.click with the CloseButton selector.
    await runAuditedStep(page, projectName, '8. Close the demo game popup', async () => {
        await page.click(SELECTORS.CloseButton);
        // Assertion: Wait for the close button to become hidden, confirming the popup is dismissed
        await expect(page.locator(SELECTORS.CloseButton)).toBeHidden();
        await page.waitForTimeout(randomDelay(600, 1200));
        verboseLog('Popup successfully closed.');
    });

    // --- STEP 9: Go back page by page until the starting URL is reached ---.
    await runAuditedStep(page, projectName, '9. Navigate back to the starting URL (max 5 attempts)', async () => {
        const targetUrl = normalizeUrl(BASE_URL);
        const maxAttempts = Math.max(BACK_STEPS, 5);

        verboseLog(`Begin navigating back to ${targetUrl}`);
        await ensureReturnToStart(page, BASE_URL, maxAttempts);

        await expect(page).toHaveURL(new RegExp(`^${targetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        verboseLog('Successfully returned to the starting URL.');
    });
});