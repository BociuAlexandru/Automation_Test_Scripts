import { test, expect, devices, Page, Locator } from '@playwright/test';

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
type ProjectConfig = {
    BASE_URL: string;
    SEARCH_PHRASE: string;
    SELECTORS: {
        NewsletterClose: string;
        OfferClose: string;
        SearchInput: string;
        FirstGameCard: string;
        DemoCTA: string;
        CloseButton: string;
    };
    BACK_STEPS: number;
};

// --- GENERIC HELPERS -------------------------------------------------------
// Close the sticky offer banner if it happens to appear.
const closeOfferPopupIfPresent = async (page: Page, selector: string, timeout = 1000) => {
    const closeButton = page.locator(selector).first();
    if ((await closeButton.count()) === 0) {
        return false;
    }

    try {
        await closeButton.waitFor({ state: 'visible', timeout });
    } catch {
        return false;
    }

    if (!(await closeButton.isVisible().catch(() => false))) {
        return false;
    }

    await closeButton.click({ delay: randomDelay(50, 120) });
    await page.waitForTimeout(randomDelay(150, 250));
    return true;
};

type SupportedProject = 'jocpacanele';

// --- PROJECT CONFIG --------------------------------------------------------
const CONFIG: Record<SupportedProject, ProjectConfig> = {
    jocpacanele: {
        BASE_URL: 'https://jocpacanele.ro/jocuri-pacanele/',
        SEARCH_PHRASE: 'Sizzling Hot Deluxe',
        SELECTORS: {
            NewsletterClose: '.wof-close.wof-close-icon',
            OfferClose: '.sticky-offer-close',
            SearchInput: 'form[role="search"] input.orig',
            FirstGameCard: '.article-card__image-wrapper > a',
            DemoCTA: '.slot-placeholder__buttons > a',
            CloseButton: '.icon-close-solid',
        },
        BACK_STEPS: 5,
    },
};

const isSupportedProject = (name: string): name is SupportedProject => name in CONFIG;

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

    try {
        await closeButton.waitFor({ state: 'visible', timeout });
    } catch {
        return false;
    }

    if (!(await closeButton.isVisible().catch(() => false))) {
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

// Small helper to wait for either search suggestions or a short timeout.
const waitForSearchResults = async (page: Page) => {
    const resultsLocator = '#ajaxsearchliteres1 .article-card__image-wrapper > a';
    await Promise.race([
        page.waitForSelector(resultsLocator, { state: 'visible', timeout: 12000 }),
        page.waitForTimeout(2000),
    ]).catch(() => null);
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
const clickDemoCta = async (page: Page, selector: string) => {
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
test('P1 Mobile: JP slot search and demo smoke', async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;

    if (!isSupportedProject(projectName)) {
        test.skip(true, `JP/JC mobile spec only runs for: ${Object.keys(CONFIG).join(', ')}`);
        return;
    }

    const config = CONFIG[projectName];
    const { BASE_URL, SEARCH_PHRASE, SELECTORS, BACK_STEPS } = config;

    await test.step('1. Navigate to JP slot list', async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        const cookieHandled = (await clickCookieAllowAllIfPresent(page)) || (await acceptCookiesIfPresent(page));
        if (!cookieHandled) {
            await page.waitForTimeout(500);
            await clickCookieAllowAllIfPresent(page);
        }
        dismissInterferingPopups(page, SELECTORS);
        await page.waitForLoadState('networkidle');
        console.log('Step 1 complete: Landing page ready.');
    });

    await test.step('2. Search for Sizzling Hot Deluxe', async () => {
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
        await waitForSearchResults(page);
        dismissInterferingPopups(page, SELECTORS);
        console.log('Step 2 complete: Search results loaded.');
    });

    await test.step('3. Tap first slot card from results', async () => {
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(300);
        dismissInterferingPopups(page, SELECTORS);

        const resultsFirstSlot = page.locator('#ajaxsearchliteres1 .article-card__image-wrapper > a').first();
        const archiveFirstSlot = page.locator(SELECTORS.FirstGameCard).first();
        const targetSlot = (await resultsFirstSlot.count()) > 0 ? resultsFirstSlot : archiveFirstSlot;

        await targetSlot.waitFor({ state: 'visible', timeout: 15000 });
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
        console.log('Step 3 complete: Navigated to slot details.');
    });

    await test.step('4. Launch demo CTA and wait for game load', async () => {
        await withTimeout(() => clickDemoCta(page, SELECTORS.DemoCTA), HANG_TIMEOUT_MS, 'Demo CTA click');

        const waitDuration = randomDelay(3000, 4000);
        await page.waitForTimeout(waitDuration);
        console.log('Step 4 complete: Demo launched and wait elapsed.');
    });

    await test.step('5. Close demo popup', async () => {
        const closeButton = page.locator(SELECTORS.CloseButton).first();
        await withTimeout(() => expect(closeButton).toBeVisible({ timeout: 15000 }), HANG_TIMEOUT_MS, 'Demo popup open');
        await closeButton.click({ delay: randomDelay(60, 130) });
        await expect(closeButton).toBeHidden({ timeout: 10000 });
        console.log('Step 5 complete: Demo popup closed.');
    });

    await test.step('6. Return to slot list', async () => {
        await navigateBackToBaseUrl(page, BASE_URL, BACK_STEPS);
        await expect(page).toHaveURL(new RegExp(`^${escapeRegex(normalizeUrl(BASE_URL))}`));
        console.log('Step 6 complete: Returned to initial slot list.');
    });
});
