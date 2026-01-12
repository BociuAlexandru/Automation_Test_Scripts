import { devices, expect, Locator, Page, test } from '@playwright/test';

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
const SEARCH_PHRASE = 'Sizzling Hot Deluxe';

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

// --- TEST -------------------------------------------------------------------
test('P1 Mobile: SC slot search and demo flow', async ({ page }) => {
    // Step 1: Load initial URL
    await test.step('1. Load SC slot list', async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
        await handleAmbientPopups(page);
        console.log('[Step 1] Loaded SC slot list and cleared popups.');
    });

    // Step 2: Scroll until search field is visible
    await test.step('2. Scroll to search field', async () => {
        const searchInput = page.locator(SEARCH_INPUT_SELECTOR);
        if ((await searchInput.count()) === 0) {
            await page.evaluate(() => window.scrollTo({ top: 450, behavior: 'instant' }));
        }
        await searchInput.first().scrollIntoViewIfNeeded().catch(() => null);
        await handleAmbientPopups(page);
        console.log('[Step 2] Search input is in viewport.');
    });

    // Step 3: Enter search phrase and submit with Enter
    await test.step('3. Enter search phrase and submit', async () => {
        const searchInput = page.locator(SEARCH_INPUT_SELECTOR);
        await typeLikeHuman(searchInput, SEARCH_PHRASE);
        await handleAmbientPopups(page);
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000);
        console.log('[Step 3] Search submitted.');
    });

    // Step 4: Click first search result
    await test.step('4. Open first search result', async () => {
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
        console.log('[Step 4] Navigated to slot details page.');
    });

    // Step 5: Click JOACA GRATIS CTA to open demo
    await test.step('5. Launch demo popup', async () => {
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
                console.log(`5. Demo popup detected on attempt ${attempt}/${maxAttempts}.`);
                break;
            } catch {
                if (attempt === maxAttempts) {
                    throw new Error('Demo popup did not appear after multiple attempts.');
                }
                await handleAmbientPopups(page);
            }
        }
        console.log('[Step 5] Demo popup opened.');
    });

    // Step 6: Wait for demo to load fully (3-4 seconds)
    await test.step('6. Wait for demo to load', async () => {
        const waitTime = randomDelay(3000, 4000);
        await page.waitForTimeout(waitTime);
        console.log(`[Step 6] Waited ${waitTime}ms for demo load.`);
    });

    // Step 7: Close popup
    await test.step('7. Close demo popup', async () => {
        const closeButton = page.locator(CLOSE_POPUP_SELECTOR).first();
        await expect(closeButton).toBeVisible({ timeout: 10000 });
        await closeButton.click({ delay: randomDelay(60, 120) });
        await expect(closeButton).toBeHidden({ timeout: 10000 });
        await page.waitForTimeout(500);
        console.log('[Step 7] Demo popup closed.');
    });

    // Step 8: Return to initial URL
    await test.step('8. Return to slot list', async () => {
        await ensureReturnToListPage(page, BASE_URL);
        await expect(page).toHaveURL(BASE_URL, { timeout: 10000 });
        console.log('[Step 8] Back on SC slot list.');
    });
});
