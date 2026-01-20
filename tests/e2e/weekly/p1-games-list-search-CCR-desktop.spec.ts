import { test, expect, Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import path from 'path';
// Desktop smoke for casino.com.ro slot search/demo flow with CSV logging + audited steps.

const BASE_URL = 'https://casino.com.ro/sloturi/';
const SUPPORTED_PROJECTS = new Set(['casino.com.ro']);
// Constants define search targets, typing cadence, CTA selectors, and retry budgets.
const SEARCH_PHRASE = 'Sizzling Hot Deluxe';
const HUMAN_TYPE_DELAY = { min: 70, max: 160 };
const HUMAN_DELAY = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const DEMO_WAIT_MS = 4000;
const MAX_BACK_ATTEMPTS = 5;
const SLOT_TILE_SELECTOR = '.grid > .col-span-1 a[href*="/slot/"]';
const DEMO_CTA_SELECTOR = 'a.js-slot-trigger.slot_gray_btn';
const SEARCH_INPUT_SELECTOR = 'form[action*="/sloturi/"] input[name="search"], input[name="search"]';

const CSV_FAILURE_DIR = path.join(process.cwd(), 'failures');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const CSV_HEADER = 'Project,Step,Details,URL,Error Message\n';
// CSV helpers mirror the pattern used across weekly specs for per-site failure artifacts.

const csvEscape = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ');
    return `"${str}"`;
};

const getCsvFilePath = (projectName: string) =>
    path.join(CSV_FAILURE_DIR, `${projectName}_p1-games-list-search-CCR-desktop_${RUN_TIMESTAMP}.csv`);

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
        // ignore url access issues
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

const typeLikeHuman = async (page: Page, selectorOrLocator: string | Locator, text: string) => {
    // Utility to convert Playwright typing into a human cadence with random delays.
    const input = typeof selectorOrLocator === 'string' ? page.locator(selectorOrLocator).first() : selectorOrLocator.first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.click({ delay: HUMAN_DELAY(80, 140) });
    await input.fill('');
    for (const char of text) {
        await page.keyboard.type(char, { delay: HUMAN_DELAY(HUMAN_TYPE_DELAY.min, HUMAN_TYPE_DELAY.max) });
    }
};

const acceptCookiesIfPresent = async (page: Page) => {
    // Attempts multiple known cookie banner selectors before proceeding.
    const selectors = [
        'button#CybotCookiebotDialogBodyButtonAccept',
        'button:has-text("Accept")',
        'button:has-text("Acceptă")',
        '#onetrust-accept-btn-handler',
        '.cc-allow',
        '.cky-btn-accept',
    ];

    for (const selector of selectors) {
        const button = page.locator(selector).first();
        if ((await button.count()) > 0 && (await button.isVisible())) {
            await button.click({ delay: HUMAN_DELAY(50, 120) });
            await page.waitForTimeout(HUMAN_DELAY(200, 350));
            return true;
        }
    }

    return false;
};

const ensureSlotTileClickable = async (tile: Locator) => {
    // Scroll + hover to reveal CTA overlays on grid tiles.
    await tile.waitFor({ state: 'visible', timeout: 10000 });
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
};

const ensureReturnedToList = async (page: Page) => {
    // Best-effort back navigation with fallbacks to ensure we return to BASE_URL.
    for (let attempt = 1; attempt <= MAX_BACK_ATTEMPTS; attempt++) {
        if (page.url().startsWith(BASE_URL)) {
            return;
        }

        await page.goBack().catch(() => null);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);

        if (page.url().startsWith(BASE_URL)) {
            return;
        }
    }

    if (!page.url().startsWith(BASE_URL)) {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
    }
};

test('P1: CCR slot search and demo smoke (desktop)', async ({ page }, testInfo) => {
    // Guard so this spec only runs for casino.com.ro projects.
    const currentProject = testInfo.project.name;
    if (currentProject && !SUPPORTED_PROJECTS.has(currentProject)) {
        test.skip(true, `CCR desktop spec only runs for: ${Array.from(SUPPORTED_PROJECTS).join(', ')}`);
        return;
    }
    const projectName = currentProject ?? 'p1-games-list-search-CCR-desktop';

    await runAuditedStep(page, projectName, '1. Navigate to slot list page', async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await acceptCookiesIfPresent(page);
        await page.waitForLoadState('networkidle');
    });

    await runAuditedStep(page, projectName, '2. Search for Sizzling Hot Deluxe', async () => {
        const input = page.locator(SEARCH_INPUT_SELECTOR).first();
        await expect(input).toBeVisible({ timeout: 10000 });
        await typeLikeHuman(page, SEARCH_INPUT_SELECTOR, SEARCH_PHRASE);
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(800);
    });

    await runAuditedStep(page, projectName, '3. Click first slot tile', async () => {
        const firstTile = page.locator(SLOT_TILE_SELECTOR).first();
        await ensureSlotTileClickable(firstTile);

        const href = (await firstTile.getAttribute('href')) ?? 'unknown-slot';
        await Promise.all([
            page.waitForLoadState('domcontentloaded'),
            firstTile.click({ delay: HUMAN_DELAY(60, 140) }),
        ]);

        await page.waitForTimeout(800);
        await acceptCookiesIfPresent(page);
    });

    await runAuditedStep(page, projectName, '4. Launch demo CTA', async () => {
        const demoButton = page.locator(DEMO_CTA_SELECTOR).filter({ hasText: /joac[aă]\s+gratis/i }).first();
        await expect(demoButton).toBeVisible({ timeout: 15000 });
        await demoButton.scrollIntoViewIfNeeded();
        await demoButton.hover();
        await demoButton.click({ delay: HUMAN_DELAY(70, 160) });
        await page.waitForTimeout(DEMO_WAIT_MS);
    });

    await runAuditedStep(page, projectName, '5. Return to slot list via back navigation', async () => {
        await ensureReturnedToList(page);
        await expect(page).toHaveURL(new RegExp(`^${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    });
});
