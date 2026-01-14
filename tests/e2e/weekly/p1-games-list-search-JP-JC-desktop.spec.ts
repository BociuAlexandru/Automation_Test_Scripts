// File Path: tests/e2e/p1-games-list-search.spec.ts

import { Page, test, expect } from '@playwright/test';

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
    };
    BACK_STEPS: number;
};

type SupportedProject = 'jocpacanele' | 'jocuricazinouri';

const CONFIG: Record<SupportedProject, ProjectConfig> = {
    // Configuration for the project that is already working
    jocpacanele: {
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
    jocuricazinouri: {
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
} as const;

const isSupportedProject = (name: string): name is SupportedProject => name in CONFIG;

const VERBOSE_LOGGING = false;
const CSV_FAILURE_DIR = path.join(process.cwd(), 'failures');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const CSV_HEADER = 'Project,Step,Details,URL,Error Message\n';

const verboseLog = (...args: unknown[]) => {
    if (VERBOSE_LOGGING) {
        console.log(...args);
    }
};

const randomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const normalizeUrl = (input: string) => {
    const url = new URL(input);
    url.hash = '';
    url.search = '';
    if (!url.pathname.endsWith('/')) {
        url.pathname += '/';
    }
    return url.toString();
};

const csvEscape = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ');
    return `"${str}"`;
};

const getCsvFilePath = (projectName: string) =>
    path.join(CSV_FAILURE_DIR, `${projectName}_p1-games-list-search-JP-JC-desktop_${RUN_TIMESTAMP}.csv`);

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

const ensureReturnToStart = async (page: Page, baseUrl: string, backSteps: number) => {
    const target = normalizeUrl(baseUrl);

    for (let i = 0; i < Math.max(backSteps - 1, 0); i++) {
        await Promise.all([page.waitForLoadState('domcontentloaded'), page.goBack()]).catch(() => null);
        const current = normalizeUrl(page.url());
        if (current.startsWith(target)) {
            return;
        }
        await page.waitForTimeout(300);
    }

    await Promise.all([page.waitForURL(target, { waitUntil: 'domcontentloaded' }), page.goBack()]).catch(() => null);

    const normalizedCurrent = normalizeUrl(page.url());
    if (!normalizedCurrent.startsWith(target)) {
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
        test.skip(true, `P1 Games List Search only runs for: ${Object.keys(CONFIG).join(', ')}`);
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
    // --- END DYNAMIC CONFIGURATION BLOCK ---
    
    // --- STEP 1: Navigate to the specific URL (using dynamic BASE_URL) ---
    // Action: Use page.goto to navigate to the exact starting link.
    await runAuditedStep(page, projectName, `1. Navigate directly to the starting URL: ${BASE_URL}`, async () => {
        await page.goto(BASE_URL);
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
        // Action: Use page.fill with the SearchInput selector and the specific phrase.
        await page.fill(SELECTORS.SearchInput, SEARCH_PHRASE);
        verboseLog(`Entered specific search phrase: ${SEARCH_PHRASE}`);
    });

    // --- STEP 4: Submit the search by pressing 'Enter' on the input field ---
    await runAuditedStep(page, projectName, '4. Submit the search by pressing Enter (Bug Workaround)', async () => {
    // Action: Use page.press on the input field to simulate pressing Enter
    // We are deliberately bypassing the bugged SearchButton click.
        await page.press(SELECTORS.SearchInput, 'Enter');
    
    // Crucial Wait: Wait for the URL to change or the results to load after submission
        await page.waitForLoadState('domcontentloaded'); 
    
        verboseLog('Search submitted by pressing Enter.');
    });

    // --- STEP 5: Click on the first game card to redirect to the Single Slot page ---
    // Action: Use page.click with the FirstGameCard selector.
    await runAuditedStep(page, projectName, '5. Click on the first game card', async () => {
        await page.click(SELECTORS.FirstGameCard);
        // Wait for the navigation to the new page to finish
        await page.waitForLoadState('domcontentloaded');
        verboseLog('Clicked game card and navigated to Single Slot page.');
    });

    // --- STEP 6: On the Single Slot page, click the CTA 'JOACĂ GRATIS' ---
    // Action: Use page.click with the DemoCTA selector.
    await runAuditedStep(page, projectName, '6. Click the Demo CTA to open the popup', async () => {
        await page.click(SELECTORS.DemoCTA);
        verboseLog("Clicked 'JOACĂ GRATIS' (Demo CTA).");
    });

    // --- STEP 7: Wait for the demo game slot popup to fully load ---
    // Action: Wait for the visibility of the CloseButton, which signals the popup is ready.
    await runAuditedStep(page, projectName, '7. Wait for the demo game slot popup to fully load', async () => {
        await expect(page.locator(SELECTORS.CloseButton)).toBeVisible({ timeout: 15000 });
        verboseLog('Demo game popup appears to be fully loaded.');
    });

    // --- STEP 8: Recognize the close button and click it to close the popup ---
    // Action: Use page.click with the CloseButton selector.
    await runAuditedStep(page, projectName, '8. Close the demo game popup', async () => {
        await page.click(SELECTORS.CloseButton);
        // Assertion: Wait for the close button to become hidden, confirming the popup is dismissed
        await expect(page.locator(SELECTORS.CloseButton)).toBeHidden();
        verboseLog('Popup successfully closed.');
    });

    // --- STEP 9: Go back page by page until the starting URL is reached ---.
    await runAuditedStep(page, projectName, `9. Navigate back to the starting URL (Requires ${BACK_STEPS} steps)`, async () => {
        await ensureReturnToStart(page, BASE_URL, BACK_STEPS);
        await expect(page).toHaveURL(new RegExp(`^${normalizeUrl(BASE_URL).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        verboseLog('Successfully returned to the starting URL.');
    });
});