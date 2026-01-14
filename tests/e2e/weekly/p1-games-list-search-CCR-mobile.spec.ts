import { test, expect, devices, Page, Locator } from '@playwright/test';
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
const BASE_URL = 'https://casino.com.ro/sloturi/';
const SEARCH_PHRASE = 'Sizzling Hot Deluxe';
const SEARCH_SLUG = 'sizzling-hot-deluxe';
const DEMO_WAIT_MS = { min: 3000, max: 4000 };
const LOOP_GUARD_MS = 15000;
const VERBOSE_LOGGING = false;

const COOKIE_ACCEPT_SELECTOR = '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll';
const COOKIE_CUSTOMIZE_SELECTOR = '#CybotCookiebotDialogBodyButtonCustomize';
const COOKIE_IFRAME_SELECTOR = 'iframe[id*="CybotCookiebotDialog"], iframe[src*="cookiebot"]';
const NEWSLETTER_CLOSE_SELECTOR = '.wof-close.wof-close-icon';
const SEARCH_BLOCK_SELECTOR = '.page_search_block';
const RESULTS_CONTAINER_SELECTOR = '.page_search_block + div';
const SEARCH_INPUT_SELECTOR = 'form[action*="/sloturi/"] input[name="search"], input[name="search"]';
const SLOT_TILE_SELECTOR = `${RESULTS_CONTAINER_SELECTOR} a[href*="/slot/"]`;
const DEMO_CTA_SELECTOR = 'a.js-mobile-slot-trigger.slot_gray_btn, a.js-slot-trigger.slot_gray_btn';
const CSV_FAILURE_DIR = path.join(process.cwd(), 'failures');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const CSV_HEADER = 'Project,Step,Details,URL,Error Message\n';

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

type ClickOptions = {
    preferJsClick?: boolean;
};

const clickIfVisible = async (locator: Locator, label: string, options: ClickOptions = {}) => {
    if ((await locator.count()) === 0) {
        return false;
    }

    const target = locator.first();
    if (!(await target.isVisible().catch(() => false))) {
        return false;
    }

    const jsClick = async () =>
        await target.evaluate((node) => {
            if (node instanceof HTMLElement) {
                node.click();
            }
        });

    if (options.preferJsClick) {
        await jsClick().catch((error) =>
            verboseWarn(`[Popup] JS click failed for ${label}.`, error),
        );
    } else {
        try {
            await target.click({ delay: randomDelay(40, 110) });
        } catch (error) {
            verboseWarn(`[Popup] Standard click failed for ${label}. Falling back to JS click.`, error);
            await jsClick();
        }
    }
    await target.page().waitForTimeout(randomDelay(150, 250));
    verboseLog(`[Popup] Dismissed via ${label}`);
    return true;
};

const cookieButtonLocators = (page: Page) => {
    const selectors = [
        COOKIE_ACCEPT_SELECTOR,
        COOKIE_CUSTOMIZE_SELECTOR,
        'button:has-text("Permite toate")',
        'button:has-text("Personalizează")',
        '#CybotCookiebotDialogBodyButtonAccept',
    ];
    const locators: Locator[] = [];
    for (const selector of selectors) {
        locators.push(page.locator(selector).first());
        locators.push(page.frameLocator(COOKIE_IFRAME_SELECTOR).locator(selector).first());
    }
    return locators;
};

const acceptCookiesIfPresent = async (page: Page) => {
    const locators = cookieButtonLocators(page);
    for (let attempt = 1; attempt <= 6; attempt++) {
        for (const locator of locators) {
            if (await clickIfVisible(locator, 'Cookie Allow All', { preferJsClick: true })) {
                return true;
            }
        }
        await page.waitForTimeout(350);
    }
    return false;
};

const closeNewsletterIfPresent = async (page: Page) => {
    const closeButton = page.locator(NEWSLETTER_CLOSE_SELECTOR).first();
    if ((await closeButton.count()) === 0) {
        return false;
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(200);
    await clickIfVisible(closeButton, 'newsletter close button', { preferJsClick: true });
};

const dismissBlockingUi = async (page: Page) => {
    await acceptCookiesIfPresent(page);
    await closeNewsletterIfPresent(page);
};

const typeLikeHuman = async (locator: Locator, text: string) =>
    withLoopGuard(async () => {
        await locator.waitFor({ state: 'visible', timeout: 15000 });
        await locator.scrollIntoViewIfNeeded();
        await locator.click({ delay: randomDelay(80, 140) });
        await locator.fill('');
        for (const char of text) {
            await locator.page().keyboard.type(char, { delay: randomDelay(70, 140) });
        }
    }, 'typeLikeHuman');

const waitForSearchResults = async (page: Page) => {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(900);
};

const ensureSlotTileClickable = async (tile: Locator, page: Page) => {
    await tile.waitFor({ state: 'visible', timeout: 15000 });
    await tile.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    const cardHandle = await tile.elementHandle();
    if (!cardHandle) {
        return;
    }

    await page.evaluate((anchor) => {
        if (!(anchor instanceof HTMLElement)) {
            return;
        }
        anchor.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        anchor.style.opacity = '1';
        anchor.style.pointerEvents = 'auto';
        anchor.style.transform = 'none';

        const overlay = anchor.closest('.slot_image_ctas, .slot-card-overlay, .slot_image') as HTMLElement | null;
        if (overlay) {
            overlay.style.opacity = '1';
            overlay.style.pointerEvents = 'auto';
            overlay.style.visibility = 'visible';
            overlay.style.transform = 'none';
            overlay.classList.remove('d-none');
        }

        const parent = anchor.parentElement;
        if (parent instanceof HTMLElement) {
            parent.style.opacity = '1';
            parent.style.pointerEvents = 'auto';
            parent.style.visibility = 'visible';
            parent.classList.remove('d-none');
        }
    }, cardHandle);

    await page.waitForTimeout(150);
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

const ensureReturnToListPage = async (page: Page) => {
    const target = normalizeUrl(BASE_URL);
    if (normalizeUrl(page.url()).startsWith(target)) {
        return;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await page.goBack();
            await page.waitForLoadState('domcontentloaded');
            if (normalizeUrl(page.url()).startsWith(target)) {
                return;
            }
        } catch (error) {
            verboseWarn(`[BackNav] attempt ${attempt} failed`, error);
        }
        await page.waitForTimeout(400);
    }

    verboseWarn('[BackNav] Using direct navigation fallback to list page.');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
};

const scrollSearchIntoView = async (page: Page) => {
    const searchBlock = page.locator(SEARCH_BLOCK_SELECTOR).first();
    if ((await searchBlock.count()) > 0) {
        await searchBlock.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
    } else {
        await page.evaluate(() => window.scrollTo({ top: 450, behavior: 'instant' }));
        await page.waitForTimeout(300);
    }
};

const waitForDemo = async (page: Page) => {
    const waitTime = randomDelay(DEMO_WAIT_MS.min, DEMO_WAIT_MS.max);
    await page.waitForTimeout(waitTime);
    verboseLog(`[Demo] Waited ${waitTime}ms for demo load.`);
};

const ensureSearchReady = async (page: Page) => {
    await scrollSearchIntoView(page);
    await dismissBlockingUi(page);
};

const scrollResultsIntoView = async (page: Page) => {
    const resultsContainer = page.locator(RESULTS_CONTAINER_SELECTOR).first();
    if ((await resultsContainer.count()) > 0) {
        await resultsContainer.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
    } else {
        const fallbackResult = page.locator(SLOT_TILE_SELECTOR).first();
        if ((await fallbackResult.count()) > 0) {
            await fallbackResult.scrollIntoViewIfNeeded();
            await page.waitForTimeout(400);
        } else {
            await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'instant' }));
            await page.waitForTimeout(300);
        }
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

const getFirstResultTile = async (page: Page) => {
    const slugMatch = page.locator(`${SLOT_TILE_SELECTOR}[href*="${SEARCH_SLUG}"]`).first();
    if ((await slugMatch.count()) > 0) {
        return slugMatch;
    }

    const imageAltMatch = page
        .locator(SLOT_TILE_SELECTOR)
        .filter({ has: page.locator(`img[alt*="${SEARCH_PHRASE}" i]`) });
    if ((await imageAltMatch.count()) > 0) {
        return imageAltMatch.first();
    }

    const textMatch = page
        .locator(SLOT_TILE_SELECTOR)
        .filter({ hasText: new RegExp(SEARCH_PHRASE.replace(/\s+/g, '\\s+'), 'i') });
    if ((await textMatch.count()) > 0) {
        return textMatch.first();
    }

    return page.locator(SLOT_TILE_SELECTOR).first();
};

const withLoopGuard = async <T>(action: () => Promise<T>, label: string, timeoutMs = LOOP_GUARD_MS) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            action(),
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`[LoopGuard] ${label} exceeded ${timeoutMs}ms and was aborted.`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
};

const csvEscape = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ');
    return `"${str}"`;
};

const getCsvFilePath = (projectName: string) =>
    path.join(CSV_FAILURE_DIR, `${projectName}_p1-games-list-search-CCR-mobile_${RUN_TIMESTAMP}.csv`);

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
    console.error(`[CSV][${projectName}] Step failure logged for "${stepName}": ${message}`);
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
    loopLabel: string,
) => {
    await withLoopGuard(
        async () => {
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
        },
        loopLabel,
        LOOP_GUARD_MS,
    );
};

// --- TEST -------------------------------------------------------------------
test('P1 Mobile: CCR slot search and demo smoke', async ({ page }) => {
    const projectName = test.info().project.name;

    await runAuditedStep(
        page,
        projectName,
        '1. Load slot list and clear blocking UI',
        async () => {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            await ensureSearchReady(page);
            await page.waitForLoadState('networkidle');
            console.log(`[Init] Loaded CCR list page ${page.url()}`);
        },
        'Step1_LoadBasePage',
    );

    let cachedResultTile: Locator | null = null;

    await runAuditedStep(
        page,
        projectName,
        '2. Search for target slot',
        async () => {
            const searchInput = page.locator(SEARCH_INPUT_SELECTOR).first();
            await expect(searchInput).toBeVisible({ timeout: 15000 });
            await ensureSearchReady(page);
            await typeLikeHuman(searchInput, SEARCH_PHRASE);
            await page.keyboard.press('Enter');
            await waitForSearchResults(page);
            await scrollResultsIntoView(page);
            cachedResultTile = await getFirstResultTile(page);
            await expect(cachedResultTile).toBeVisible({ timeout: 10000 });
            await dismissBlockingUi(page);
            console.log('[Search] Submitted and results should be visible.');
        },
        'Step2_Search',
    );

    await runAuditedStep(
        page,
        projectName,
        '3. Open first slot result',
        async () => {
            const firstTile = cachedResultTile ?? (await getFirstResultTile(page));
            await expect(firstTile).toBeVisible({ timeout: 10000 });
            await ensureSlotTileClickable(firstTile, page);
            await forceSameTabNavigation(firstTile);

            const href = (await firstTile.getAttribute('href')) ?? 'unknown-slot';

            let clickSucceeded = false;
            try {
                await firstTile.click({ delay: randomDelay(70, 140), timeout: 5000 });
                clickSucceeded = true;
            } catch (error) {
                verboseWarn('[Slot] Primary click failed, falling back to JS click.', error);
            }

            if (!clickSucceeded) {
                await firstTile.evaluate((node) => {
                    if (node instanceof HTMLElement) {
                        node.click();
                    }
                });
            }

            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(800);
            verboseLog(`[Slot] Navigated to slot page ${href}`);

            await dismissBlockingUi(page);
        },
        'Step3_OpenSlot',
    );

    await runAuditedStep(
        page,
        projectName,
        '4. Launch demo CTA',
        async () => {
            const demoButton = page.locator(DEMO_CTA_SELECTOR).filter({ hasText: /joac[aă]\s+gratis/i }).first();
            await expect(demoButton).toBeVisible({ timeout: 15000 });
            await demoButton.scrollIntoViewIfNeeded();
            await demoButton.click({ delay: randomDelay(70, 150) });
            await waitForDemo(page);
        },
        'Step4_LaunchDemo',
    );

    await runAuditedStep(
        page,
        projectName,
        '5. Return to slot list',
        async () => {
            await ensureReturnToListPage(page);
            await expect(page).toHaveURL(new RegExp(`^${normalizeUrl(BASE_URL).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`));
            await dismissBlockingUi(page);
            console.log('[BackNav] Returned to base slot list.');
        },
        'Step5_BackNav',
    );
});
