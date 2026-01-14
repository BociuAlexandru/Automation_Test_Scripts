import { test, expect, devices, Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import path from 'path';

// --- DEVICE & CONTEXT SETUP ------------------------------------------------
// Use the built-in iPhone 13 descriptor so the test behaves like a mobile user.
const { defaultBrowserType: _ignored, ...iPhone13Descriptor } = devices['iPhone 13'];

// Apply the mobile device settings plus Romanian locale/timezone for parity with prod.
test.use({
    ...iPhone13Descriptor,
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    permissions: ['geolocation'],
    ignoreHTTPSErrors: true,
});

// --- CONFIGURATION TYPES ---------------------------------------------------
// Each supported project provides its own selectors and search phrase.
type DemoLaunchMode = 'popup' | 'new_tab';

type ProjectConfig = {
    BASE_URL: string;
    SEARCH_PHRASE: string;
    SELECTORS: {
        NewsletterClose: string;
        OfferClose: string;
        SearchInput: string;
        SearchResultCard: string;
        FirstGameCard: string;
        DemoCTA: string;
        CloseButton?: string;
    };
    BACK_STEPS: number;
    DEMO_MODE: DemoLaunchMode;
    REQUIRE_POPUP_CLEAR?: boolean;
};

// --- GENERIC HELPERS -------------------------------------------------------
// Close the sticky offer banner if it happens to appear.
const closeOfferPopupIfPresent = async (page: Page, selector: string, timeout = 1000) => {
    const closeButton = page.locator(selector).first();
    if ((await closeButton.count()) === 0) {
        return false;
    }

    const isVisible = await closeButton.isVisible().catch(() => false);
    if (!isVisible) {
        return false;
    }

    await closeButton.click({ delay: randomDelay(50, 120) });
    await page.waitForTimeout(randomDelay(150, 250));
    return true;
};

type SupportedProject = 'jocpacanele' | 'jocuricazinouri';

// --- PROJECT CONFIG --------------------------------------------------------
const CONFIG: Record<SupportedProject, ProjectConfig> = {
    jocpacanele: {
        BASE_URL: 'https://jocpacanele.ro/jocuri-pacanele/',
        SEARCH_PHRASE: 'Sizzling Hot Deluxe',
        SELECTORS: {
            NewsletterClose: '.wof-close.wof-close-icon',
            OfferClose: '.sticky-offer-close',
            SearchInput: 'form[role="search"] input.orig',
            SearchResultCard: '#ajaxsearchliteres1 .article-card__image-wrapper > a',
            FirstGameCard: '.article-card__image-wrapper > a',
            DemoCTA: '.slot-placeholder__buttons > a',
            CloseButton: '.icon-close-solid',
        },
        BACK_STEPS: 5,
        DEMO_MODE: 'popup',
    },
    jocuricazinouri: {
        BASE_URL: 'https://jocuricazinouri.com/jocuri-casino-gratis/',
        SEARCH_PHRASE: 'Sizzling Hot Deluxe',
        SELECTORS: {
            NewsletterClose: '.wof-close.wof-close-icon',
            OfferClose: '.sticky-offer-close',
            SearchInput: 'form#searchform input#s',
            SearchResultCard: '.post-thumb__left > a',
            FirstGameCard: '.post-thumb__left > a',
            DemoCTA: 'a.button--internal.single-slot__play:not(.d-none)[data-slot-iframe-url]',
        },
        BACK_STEPS: 5,
        DEMO_MODE: 'new_tab',
        REQUIRE_POPUP_CLEAR: true,
    },
};

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

const verboseWarn = (...args: unknown[]) => {
    if (VERBOSE_LOGGING) {
        console.warn(...args);
    }
};

// Utility: wrap operations with a descriptive timeout for better logs.
const randomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const HANG_TIMEOUT_MS = 30000;

const withTimeout = async <T>(operation: () => Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            operation(),
            new Promise<T>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`${label} exceeded ${timeoutMs}ms`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
};

// Mimic slow human typing so the autocomplete on site behaves as expected.
const typeLikeHuman = async (input: Locator, text: string) => {
    await input.waitFor({ state: 'visible', timeout: 15000 });
    await input.scrollIntoViewIfNeeded();
    await input.click({ delay: randomDelay(70, 140) });
    await input.fill('');

    for (const char of text) {
        await input.page().keyboard.type(char, { delay: randomDelay(70, 160) });
    }
};

const COOKIE_ALLOW_ALL_SELECTOR = '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll';

// Try all known cookie banners; exit early if one is dismissed.
const acceptCookiesIfPresent = async (page: Page) => {
    const selectors = [
        '#CybotCookiebotDialogBodyButtonAccept',
        COOKIE_ALLOW_ALL_SELECTOR,
        '.cky-btn-accept',
        '.cc-allow',
        'button:has-text("Accept")',
        'button:has-text("Acceptă")',
    ];

    for (const selector of selectors) {
        const bannerButton = page.locator(selector).first();
        if ((await bannerButton.count()) > 0 && (await bannerButton.isVisible())) {
            await bannerButton.click({ delay: randomDelay(60, 130) });
            await page.waitForTimeout(randomDelay(250, 400));
            return true;
        }
    }

    return false;
};

// Shortcut for the Cookiebot "Allow All" button.
const clickCookieAllowAllIfPresent = async (page: Page) => {
    const allowAllButton = page.locator(COOKIE_ALLOW_ALL_SELECTOR).first();
    if ((await allowAllButton.count()) === 0) {
        return false;
    }

    try {
        await allowAllButton.waitFor({ state: 'visible', timeout: 10000 });
        await allowAllButton.scrollIntoViewIfNeeded();
        await allowAllButton.click({ delay: randomDelay(60, 140) });
        await page.waitForTimeout(randomDelay(250, 400));
        return true;
    } catch {
        return false;
    }
};

// Newsletter modal dismissal helper.
const closeNewsletterIfPresent = async (page: Page, selector: string, timeout = 1000) => {
    const closeButton = page.locator(selector).first();
    if ((await closeButton.count()) === 0) {
        return false;
    }

    const isVisible = await closeButton.isVisible().catch(() => false);
    if (!isVisible) {
        return false;
    }

    await closeButton.click({ delay: randomDelay(50, 120) });
    await page.waitForTimeout(randomDelay(150, 250));
    return true;
};

// Best-effort cleanup so elements underneath stay clickable.
const dismissInterferingPopups = async (page: Page, selectors: ProjectConfig['SELECTORS']) => {
    await closeNewsletterIfPresent(page, selectors.NewsletterClose).catch(() => null);
    await closeOfferPopupIfPresent(page, selectors.OfferClose).catch(() => null);
};

const prepareLandingPage = async (page: Page, config: ProjectConfig) => {
    await page.goto(config.BASE_URL, { waitUntil: 'domcontentloaded' });
    const cookieHandled = (await clickCookieAllowAllIfPresent(page)) || (await acceptCookiesIfPresent(page));
    if (!cookieHandled) {
        await page.waitForTimeout(500);
        await clickCookieAllowAllIfPresent(page);
    }
    // Fire-and-forget popup cleanup so we don't block the main flow.
    void dismissInterferingPopups(page, config.SELECTORS);
};

const runSearchFlow = async (page: Page, config: ProjectConfig) => {
    const { SELECTORS, SEARCH_PHRASE, REQUIRE_POPUP_CLEAR } = config;
    if (REQUIRE_POPUP_CLEAR) {
        await dismissInterferingPopups(page, SELECTORS);
    } else {
        void dismissInterferingPopups(page, SELECTORS);
    }
    const searchInput = page.locator(SELECTORS.SearchInput).first();
    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await searchInput.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await typeLikeHuman(searchInput, SEARCH_PHRASE);
    await page.keyboard.press('Enter');
    await withTimeout(
        () =>
            Promise.all([
                page.waitForLoadState('domcontentloaded'),
                page.waitForURL((url) => url.toString().includes('?s='), { timeout: 15000 }).catch(() => null),
            ]),
        HANG_TIMEOUT_MS,
        'Search results load',
    );
    await page.waitForTimeout(1200);
    await waitForSearchResults(page, SELECTORS.SearchResultCard);
    await dismissInterferingPopups(page, SELECTORS);
};

const ensureSlotCardAvailable = async (page: Page, config: ProjectConfig): Promise<Locator> => {
    const { SELECTORS } = config;
    for (let attempt = 1; attempt <= 2; attempt++) {
        const resultsFirstSlot = page.locator(SELECTORS.SearchResultCard).first();
        const archiveFirstSlot = page.locator(SELECTORS.FirstGameCard).first();
        const targetSlot = (await resultsFirstSlot.count()) > 0 ? resultsFirstSlot : archiveFirstSlot;

        try {
            await targetSlot.waitFor({ state: 'visible', timeout: 15000 });
            return targetSlot;
        } catch (error) {
            const serviceUnavailableVisible = await page
                .locator('text=Service Unavailable')
                .first()
                .isVisible()
                .catch(() => false);

            if (serviceUnavailableVisible && attempt === 1) {
                console.warn('[Search] 503 Service Unavailable detected; retrying full search flow.');
                await prepareLandingPage(page, config);
                await runSearchFlow(page, config);
                continue;
            }

            throw error;
        }
    }

    throw new Error('Slot cards not visible after retries.');
};

// Small helper to wait for either search suggestions or a short timeout.
const waitForSearchResults = async (page: Page, resultsSelector: string) => {
    const resultsLocator = resultsSelector;
    await Promise.race([
        page.waitForSelector(resultsLocator, { state: 'visible', timeout: 12000 }),
        page.waitForTimeout(2000),
    ]).catch(() => null);
};

// When JC launches a slot, it opens a separate tab—listen for whichever event fires first.
const waitForSecondaryPage = async (page: Page, timeoutMs = 15000) => {
    const popupPromise = page.waitForEvent('popup', { timeout: timeoutMs }).catch(() => null);
    const contextPromise = page.context().waitForEvent('page', { timeout: timeoutMs }).catch(() => null);
    return Promise.race([popupPromise, contextPromise]);
};

// Mobile-specific: immediately navigate back to the slot list once the demo closes.
const navigateBackToBaseUrl = async (
    page: Page,
    baseUrl: string,
    _backSteps: number,
) => {
    console.log('[BackNav] Direct navigation fallback engaged.');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
};

// Normalize URLs so comparisons ignore search params or missing trailing slashes.
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

// Escape dynamic URLs before building regex expectations.
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const csvEscape = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ');
    return `"${str}"`;
};

const getCsvFilePath = (projectName: string) =>
    path.join(CSV_FAILURE_DIR, `${projectName}_p1-games-list-search-JP-JC-mobile_${RUN_TIMESTAMP}.csv`);

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

// The CTA lives in a "slot placeholder" with overlays; reveal it through DOM tweaks.
const ensurePlaceholderVisible = async (page: Page, button: Locator) => {
    const placeholderHandle = await button.evaluateHandle((el) => el.closest('.slot-placeholder'));
    const placeholderElement = placeholderHandle.asElement();
    if (!placeholderElement) {
        await placeholderHandle.dispose();
        return false;
    }

    await page.evaluate((placeholder) => {
        if (!(placeholder instanceof HTMLElement)) return;
        const ensureVisible = (node: HTMLElement) => {
            node.classList.remove('hidden');
            node.style.opacity = '1';
            node.style.visibility = 'visible';
            node.style.display = 'block';
            node.style.pointerEvents = 'auto';
            node.style.transform = 'none';
            node.style.maxHeight = 'none';
            node.style.height = 'auto';
            node.style.zIndex = '9998';
        };

        ensureVisible(placeholder);
        const overlay = placeholder.querySelector('.overlay');
        if (overlay instanceof HTMLElement) {
            overlay.style.opacity = '0';
            overlay.style.visibility = 'hidden';
            overlay.style.pointerEvents = 'none';
            overlay.style.display = 'none';
        }

        const offers = placeholder.querySelector('.slot-placeholder__offers');
        if (offers instanceof HTMLElement) {
            offers.style.pointerEvents = 'none';
            offers.style.opacity = '0';
            offers.style.display = 'none';
        }

        const buttons = placeholder.querySelector('.slot-placeholder__buttons');
        if (buttons instanceof HTMLElement) {
            buttons.classList.remove('hidden');
            buttons.style.opacity = '1';
            buttons.style.visibility = 'visible';
            buttons.style.display = 'flex';
            buttons.style.flexDirection = 'column';
            buttons.style.gap = '12px';
            buttons.style.pointerEvents = 'auto';
            buttons.style.transform = 'none';
            buttons.style.zIndex = '9999';
        }
    }, placeholderElement);

    await placeholderHandle.dispose();
    return true;
};

// Prepare the CTA by forcing it into view and ensuring it is interactable.
const prepareDemoButton = async (page: Page, selector: string) => {
    const candidates = page.locator(selector);
    const count = await candidates.count();
    if (count === 0) {
        throw new Error(`Demo CTA selector "${selector}" did not match any elements.`);
    }
    const button = candidates.first();
    await button.waitFor({ state: 'attached', timeout: 20000 });

    const revealedThroughPlaceholder = await ensurePlaceholderVisible(page, button);
    if (!revealedThroughPlaceholder) {
        await button.scrollIntoViewIfNeeded().catch(() => null);
        await page.waitForTimeout(200);
    }

    const handle = await button.elementHandle();
    if (handle) {
        await page.evaluate((el) => {
            if (!(el instanceof HTMLElement)) return;
            el.classList.remove('hidden');
            el.style.opacity = '1';
            el.style.visibility = 'visible';
            el.style.display = 'inline-flex';
            el.style.pointerEvents = 'auto';
            el.style.transform = 'none';
            el.style.zIndex = '10000';
        }, handle);
    }

    return button;
};

// Click the CTA, retrying via JS if the DOM overlay blocks the press.
const clickDemoCta = async (page: Page, selector: string, mode: DemoLaunchMode) => {
    if (mode === 'new_tab') {
        const buttons = page.locator(selector);
        const matches = await buttons.count();
        if (matches === 0) {
            throw new Error(`Demo CTA selector "${selector}" did not match any elements.`);
        }

        let simpleButton: Locator | null = null;
        for (let index = 0; index < matches; index++) {
            const candidate = buttons.nth(index);
            await candidate.waitFor({ state: 'attached', timeout: 10000 }).catch(() => null);
            if (await candidate.isVisible().catch(() => false)) {
                const hasSize = await candidate
                    .evaluate((node) => {
                        if (!(node instanceof HTMLElement)) return false;
                        const box = node.getBoundingClientRect();
                        return box.width > 0 && box.height > 0;
                    })
                    .catch(() => false);
                if (hasSize) {
                    simpleButton = candidate;
                    break;
                }
            }
        }

        if (!simpleButton) {
            simpleButton = buttons.first();
        }

        await simpleButton.waitFor({ state: 'visible', timeout: 20000 }).catch(() => null);
        await page.evaluate(() => {
            window.scrollBy({ top: window.innerHeight * 0.25, behavior: 'auto' });
        });
        await simpleButton.scrollIntoViewIfNeeded().catch(() => null);
        await simpleButton.evaluate((node) => {
            const el = node as HTMLElement | null;
            el?.scrollIntoView({ behavior: 'auto', block: 'center' });
        }).catch(() => null);
        await page.waitForTimeout(400);
        await simpleButton.click({ delay: randomDelay(80, 140), force: true, noWaitAfter: true }).catch(async (error) => {
            await simpleButton
                ?.evaluate((el) => {
                    if (el instanceof HTMLElement) {
                        el.click();
                    }
                })
                .catch(() => {
                    throw error;
                });
        });
        return simpleButton;
    }

    const demoButton = await prepareDemoButton(page, selector);
    const buttonHandle = await demoButton.elementHandle();
    if (!buttonHandle) {
        throw new Error('Demo CTA handle missing after exposure.');
    }

    const attemptClick = async () => {
        await demoButton.click({ delay: randomDelay(80, 150), force: true });
    };

    try {
        await attemptClick();
    } catch (error) {
        await page.evaluate((el) => {
            if (!(el instanceof HTMLElement)) return;
            el.click();
        }, buttonHandle).catch(async () => {
            await demoButton.scrollIntoViewIfNeeded().catch(() => null);
            await page.waitForTimeout(200);
            await attemptClick().catch(() => {
                throw error;
            });
        });
    }

    return demoButton;
};

// --- MAIN TEST -------------------------------------------------------------
test('P1 Mobile: JP/JC slot search and demo smoke', async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;

    if (!isSupportedProject(projectName)) {
        test.skip(true, `JP/JC mobile spec only runs for: ${Object.keys(CONFIG).join(', ')}`);
        return;
    }

    const config = CONFIG[projectName];
    const { BASE_URL, SEARCH_PHRASE, SELECTORS, BACK_STEPS, DEMO_MODE } = config;
    let newlyOpenedDemoPage: Page | null = null;

    await runAuditedStep(page, projectName, '1. Navigate to slot list', async () => {
        await prepareLandingPage(page, config);
        verboseLog('Step 1 complete: Landing page ready.');
    });

    await runAuditedStep(page, projectName, '2. Search for Sizzling Hot Deluxe', async () => {
        await runSearchFlow(page, config);
        verboseLog('Step 2 complete: Search results loaded.');
    });

    await runAuditedStep(page, projectName, '3. Tap first slot card from results', async () => {
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(300);
        dismissInterferingPopups(page, SELECTORS);

        const targetSlot = await ensureSlotCardAvailable(page, config);
        await targetSlot.scrollIntoViewIfNeeded();
        await targetSlot.hover();
        await page.waitForTimeout(300);

        await targetSlot.evaluate((node) => {
            if (node instanceof HTMLAnchorElement) {
                node.target = '_self';
            }
        });

        await withTimeout(
            () =>
                Promise.all([
                    page.waitForLoadState('domcontentloaded'),
                    targetSlot.click({ delay: randomDelay(80, 150) }),
                ]),
            HANG_TIMEOUT_MS,
            'Slot navigation',
        );

        await page.waitForTimeout(800);
        await clickCookieAllowAllIfPresent(page);
        await acceptCookiesIfPresent(page);
        dismissInterferingPopups(page, SELECTORS);
        verboseLog('Step 3 complete: Navigated to slot details.');
    });

    await runAuditedStep(page, projectName, '4. Launch demo CTA and confirm open state', async () => {
        let secondaryPagePromise: Promise<Page | null> | undefined;
        if (DEMO_MODE === 'new_tab') {
            secondaryPagePromise = waitForSecondaryPage(page, 15000);
        }

        await withTimeout(() => clickDemoCta(page, SELECTORS.DemoCTA, DEMO_MODE), HANG_TIMEOUT_MS, 'Demo CTA click');

        if (DEMO_MODE === 'new_tab' && secondaryPagePromise) {
            newlyOpenedDemoPage = await secondaryPagePromise;
            expect(newlyOpenedDemoPage, 'Demo should open a new page/tab.').toBeTruthy();
            await newlyOpenedDemoPage?.waitForLoadState('domcontentloaded').catch(() => null);
            verboseLog('Step 4 complete: Demo opened in a new tab.');
            return;
        }

        const waitDuration = randomDelay(3000, 4000);
        await page.waitForTimeout(waitDuration);
        verboseLog('Step 4 complete: Demo launched within popup.');
    });

    await runAuditedStep(page, projectName, '5. Validate demo dismissal state', async () => {
        if (DEMO_MODE === 'new_tab') {
            expect(newlyOpenedDemoPage, 'Demo should open a secondary tab.').toBeTruthy();
            await newlyOpenedDemoPage?.close().catch(() => null);
            verboseLog('Step 5 complete: Demo tab detected and closed.');
            return;
        }

        const closeSelector = SELECTORS.CloseButton;
        if (!closeSelector) {
            throw new Error('Close button selector missing for popup demo project.');
        }

        const closeButton = page.locator(closeSelector).first();
        await withTimeout(() => expect(closeButton).toBeVisible({ timeout: 15000 }), HANG_TIMEOUT_MS, 'Demo popup open');
        await closeButton.click({ delay: randomDelay(60, 130) });
        await expect(closeButton).toBeHidden({ timeout: 10000 });
        verboseLog('Step 5 complete: Demo popup closed.');
    });

    await runAuditedStep(page, projectName, '6. Return to slot list', async () => {
        await navigateBackToBaseUrl(page, BASE_URL, BACK_STEPS);
        await expect(page).toHaveURL(new RegExp(`^${escapeRegex(normalizeUrl(BASE_URL))}`));
        verboseLog('Step 6 complete: Returned to initial slot list.');
    });
});
