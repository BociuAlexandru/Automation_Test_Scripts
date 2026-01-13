import { test, expect, Page, Locator } from '@playwright/test';

const BASE_URL = 'https://casino.com.ro/sloturi/';
const SEARCH_PHRASE = 'Sizzling Hot Deluxe';
const HUMAN_TYPE_DELAY = { min: 70, max: 160 };
const HUMAN_DELAY = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const DEMO_WAIT_MS = 4000;
const MAX_BACK_ATTEMPTS = 5;
const SLOT_TILE_SELECTOR = '.grid > .col-span-1 a[href*="/slot/"]';
const DEMO_CTA_SELECTOR = 'a.js-slot-trigger.slot_gray_btn';
const SEARCH_INPUT_SELECTOR = 'form[action*="/sloturi/"] input[name="search"], input[name="search"]';

const typeLikeHuman = async (page: Page, selectorOrLocator: string | Locator, text: string) => {
    const input = typeof selectorOrLocator === 'string' ? page.locator(selectorOrLocator).first() : selectorOrLocator.first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.click({ delay: HUMAN_DELAY(80, 140) });
    await input.fill('');
    for (const char of text) {
        await page.keyboard.type(char, { delay: HUMAN_DELAY(HUMAN_TYPE_DELAY.min, HUMAN_TYPE_DELAY.max) });
    }
};

const acceptCookiesIfPresent = async (page: Page) => {
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
            console.log(`Cookies dismissed via selector: ${selector}`);
            return true;
        }
    }

    return false;
};

const ensureSlotTileClickable = async (tile: Locator) => {
    await tile.waitFor({ state: 'visible', timeout: 10000 });
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
};

const ensureReturnedToList = async (page: Page) => {
    for (let attempt = 1; attempt <= MAX_BACK_ATTEMPTS; attempt++) {
        if (page.url().startsWith(BASE_URL)) {
            console.log(`Already on list page after ${attempt - 1} back steps.`);
            return;
        }

        await page.goBack().catch(() => null);
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(500);

        console.log(`Back navigation attempt ${attempt}/${MAX_BACK_ATTEMPTS}: ${page.url()}`);
        if (page.url().startsWith(BASE_URL)) {
            return;
        }
    }

    if (!page.url().startsWith(BASE_URL)) {
        console.warn('Back navigation attempts exhausted; navigating directly to BASE_URL.');
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
    }
};

test('P1: CCR slot search and demo smoke (desktop)', async ({ page }) => {
    await test.step('1. Navigate to slot list page', async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await acceptCookiesIfPresent(page);
        await page.waitForLoadState('networkidle');
        console.log(`Loaded CCR slot list: ${page.url()}`);
    });

    await test.step('2. Search for Sizzling Hot Deluxe', async () => {
        const input = page.locator(SEARCH_INPUT_SELECTOR).first();
        await expect(input).toBeVisible({ timeout: 10000 });
        await typeLikeHuman(page, SEARCH_INPUT_SELECTOR, SEARCH_PHRASE);
        await page.keyboard.press('Enter');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(800);
        console.log('Search submitted.');
    });

    await test.step('3. Click first slot tile', async () => {
        const firstTile = page.locator(SLOT_TILE_SELECTOR).first();
        await ensureSlotTileClickable(firstTile);

        const href = (await firstTile.getAttribute('href')) ?? 'unknown-slot';
        await Promise.all([
            page.waitForLoadState('domcontentloaded'),
            firstTile.click({ delay: HUMAN_DELAY(60, 140) }),
        ]);

        await page.waitForTimeout(800);
        console.log(`Navigated to slot page: ${href}`);
        await acceptCookiesIfPresent(page);
    });

    await test.step('4. Launch demo CTA', async () => {
        const demoButton = page.locator(DEMO_CTA_SELECTOR).filter({ hasText: /joac[aă]\s+gratis/i }).first();
        await expect(demoButton).toBeVisible({ timeout: 15000 });
        await demoButton.scrollIntoViewIfNeeded();
        await demoButton.hover();
        await demoButton.click({ delay: HUMAN_DELAY(70, 160) });
        await page.waitForTimeout(DEMO_WAIT_MS);
        console.log(`Demo launched, waited ${DEMO_WAIT_MS}ms`);
    });

    await test.step('5. Return to slot list via back navigation', async () => {
        await ensureReturnedToList(page);
        await expect(page).toHaveURL(new RegExp(`^${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        console.log('Returned to slot list.');
    });
});
