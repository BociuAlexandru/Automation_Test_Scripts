import { expect, Page, test } from '@playwright/test';

type PaymentPageConfig = {
    path: string;
    label: string;
    keyword: string;
    expectedPaymentPattern: RegExp;
};

type SoftFailure = {
    pagePath: string;
    cardLabel: string;
    reason: string;
};

const BASE_URL = 'https://www.supercazino.ro';
const CARD_SELECTOR = '.acf-casino-default-offer';
const REVIEW_LINK_SELECTOR = 'a.casino-review';
const PAYMENT_SECTION_TITLE = /Metode de plat[ăa]/i;
const PAYMENT_IMAGE_SELECTOR = 'img[alt], img[title]';

const PAYMENT_PAGES: PaymentPageConfig[] = [
    { path: '/blog/visa/', label: 'Visa', keyword: 'visa', expectedPaymentPattern: /visa/i },
    { path: '/blog/mastercard/', label: 'Mastercard', keyword: 'mastercard', expectedPaymentPattern: /mastercard/i },
    { path: '/blog/card-revolut-casino/', label: 'Card Revolut', keyword: 'revolut', expectedPaymentPattern: /revolut/i },
    { path: '/blog/cazinouri-skrill/', label: 'Skrill', keyword: 'skrill', expectedPaymentPattern: /skrill/i },
    { path: '/blog/neteller/', label: 'Neteller', keyword: 'neteller', expectedPaymentPattern: /neteller/i },
    { path: '/blog/cazinouri-paysafecard/', label: 'Paysafecard', keyword: 'paysafecard', expectedPaymentPattern: /paysafecard/i },
    { path: '/blog/transfer-bancar/', label: 'Transfer Bancar', keyword: 'transfer', expectedPaymentPattern: /transfer\s*bancar/i },
    { path: '/blog/okto-cash/', label: 'Okto Cash', keyword: 'okto', expectedPaymentPattern: /okto/i },
    { path: '/blog/abon/', label: 'Abon', keyword: 'abon', expectedPaymentPattern: /abon/i },
    { path: '/blog/cazinouri-paypal/', label: 'PayPal', keyword: 'paypal', expectedPaymentPattern: /paypal/i },
    { path: '/blog/trustly/', label: 'Trustly', keyword: 'trustly', expectedPaymentPattern: /trustly/i },
    { path: '/blog/cazinouri-top-pay/', label: 'Top Pay', keyword: 'top pay', expectedPaymentPattern: /top\s*pay/i },
];

test.describe('P1 - Metode de plata - Supercazino Desktop', () => {
    test('Validates payment tags on casino review CTAs', async ({ page }) => {
        const softFailures: SoftFailure[] = [];
        let cookiesDismissed = false;

        for (const paymentPage of PAYMENT_PAGES) {
            const targetUrl = `${BASE_URL}${normalizePath(paymentPage.path)}`;

            await test.step(`Visit ${paymentPage.label} landing page`, async () => {
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
                if (!cookiesDismissed) {
                    cookiesDismissed = await dismissCookiesIfPresent(page);
                }
                await page.waitForLoadState('networkidle').catch(() => undefined);
            });

            const cards = page.locator(CARD_SELECTOR);
            const cardCount = await cards.count();

            if (cardCount === 0) {
                recordFailure(softFailures, paymentPage.path, 'N/A', 'No casino offer cards found');
                continue;
            }

            for (let index = 0; index < cardCount; index++) {
                const card = cards.nth(index);
                await card.scrollIntoViewIfNeeded();

                const reviewLink = card
                    .locator(REVIEW_LINK_SELECTOR)
                    .filter({ hasText: /Recenzie/i })
                    .first();

                const cardLabel = (await reviewLink.textContent())?.replace(/\s+/g, ' ').trim() || `Card #${index + 1}`;

                if ((await reviewLink.count()) === 0) {
                    recordFailure(softFailures, paymentPage.path, cardLabel, 'Review CTA not found');
                    continue;
                }

                const href = await reviewLink.getAttribute('href');
                if (!href) {
                    recordFailure(softFailures, paymentPage.path, cardLabel, 'Review CTA missing href');
                    continue;
                }

                const expectedPath = normalizePath(new URL(href, BASE_URL).pathname);

                try {
                    await Promise.all([
                        page.waitForURL((url) => normalizePath(url.pathname) === expectedPath, { timeout: 15000 }),
                        reviewLink.click({ timeout: 8000 }),
                    ]);
                    await page.waitForLoadState('networkidle').catch(() => undefined);
                    console.log(`[${paymentPage.path}] Navigated to ${page.url()} for ${cardLabel}`);
                } catch (error) {
                    recordFailure(
                        softFailures,
                        paymentPage.path,
                        cardLabel,
                        `Failed to open review page (${error instanceof Error ? error.message : 'unknown error'})`,
                    );
                    await safeReturnTo(page, targetUrl);
                    continue;
                }

                const paymentVerified = await verifyPaymentSection(page, paymentPage);
                if (!paymentVerified) {
                    recordFailure(
                        softFailures,
                        paymentPage.path,
                        cardLabel,
                        `Payment icon missing for pattern ${paymentPage.expectedPaymentPattern}`,
                    );
                }

                await safeReturnTo(page, targetUrl);
            }
        }

        if (softFailures.length > 0) {
            const summary = softFailures
                .map((failure) => `- [${failure.pagePath}] ${failure.cardLabel}: ${failure.reason}`)
                .join('\n');
            throw new Error(`Metode de plata audit discovered ${softFailures.length} issues:\n${summary}`);
        }
    });
});

async function verifyPaymentSection(page: Page, config: PaymentPageConfig): Promise<boolean> {
    const { expectedPaymentPattern: pattern, keyword } = config;
    const casinoDetailsRow = page.locator('.row.casino_details');
    try {
        await casinoDetailsRow.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
        console.warn(`[${page.url()}] casino_details block never appeared.`);
        return false;
    }

    let paymentSection = casinoDetailsRow.locator('.col-lg-4').nth(2);
    try {
        await paymentSection.waitFor({ state: 'attached', timeout: 5000 });
    } catch {
        console.warn(`[${page.url()}] Third column inside casino_details missing.`);
    }

    const titleLocator = paymentSection.locator('.title').first();
    const titleText = normalizeText(await titleLocator.textContent().catch(() => ''));
    console.log(`[${page.url()}] Candidate payment title text: "${titleText}"`);
    if (!/metode de plat[ăa]/i.test(titleText)) {
        const explicitTitle = page.locator('text=/Metode de plat(ă|a)/i').first();
        try {
            await explicitTitle.waitFor({ state: 'visible', timeout: 8000 });
            paymentSection = explicitTitle.locator('xpath=ancestor::div[contains(@class, "col-lg-4")]').first();
            const fallbackTitle = normalizeText(await explicitTitle.textContent().catch(() => ''));
            console.log(`[${page.url()}] Fallback payment title text: "${fallbackTitle}"`);
        } catch {
            console.warn(`[${page.url()}] Metode de plată section never became visible.`);
            return false;
        }
    }

    await paymentSection.evaluate((node) => node.scrollIntoView({ behavior: 'instant', block: 'center' })).catch(() => undefined);
    await page.waitForTimeout(500).catch(() => undefined);

    const paymentImages = paymentSection.locator(PAYMENT_IMAGE_SELECTOR);
    await paymentImages.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);

    const paymentData = await paymentImages.evaluateAll((imgs) =>
        imgs.map((img) => ({
            alt: (img.getAttribute('alt') || '').toLowerCase(),
            title: (img.getAttribute('title') || '').toLowerCase(),
        })),
    );

    const hasIconInSection = paymentData.some((entry) => pattern.test(entry.alt) || pattern.test(entry.title));
    if (hasIconInSection) {
        return true;
    }

    const keywordSelector = buildKeywordSelector(keyword);
    const keywordLocator = page.locator(keywordSelector);
    const keywordCount = await keywordLocator.count();
    if (keywordCount === 0) {
        const altDump = paymentData.map((entry) => `${entry.alt}|${entry.title}`).join(', ');
        console.warn(`Payment icons collected but no match for ${keyword}: ${altDump}`);
        return false;
    }

    console.warn(`[${page.url()}] Falling back to keyword match: found ${keywordCount} element(s) for ${keyword}.`);
    return true;
}

async function safeReturnTo(page: Page, url: string) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function dismissCookiesIfPresent(page: Page): Promise<boolean> {
    const selectors = [
        'button:has-text("Acceptă")',
        'button:has-text("Acceptă selecția")',
        'button:has-text("Accept")',
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
        '#CybotCookiebotDialogBodyButtonDecline',
    ];

    for (const selector of selectors) {
        const button = page.locator(selector).first();
        if ((await button.count()) > 0 && (await button.isVisible().catch(() => false))) {
            await button.click({ timeout: 4000 }).catch(() => undefined);
            await page.waitForTimeout(200).catch(() => undefined);
            return true;
        }
    }
    return false;
}

function normalizePath(pathname: string): string {
    if (!pathname.endsWith('/')) {
        return `${pathname}/`;
    }
    return pathname;
}

function recordFailure(failures: SoftFailure[], pagePath: string, cardLabel: string, reason: string) {
    failures.push({ pagePath, cardLabel, reason });
    console.error(`[${pagePath}] ${cardLabel} -> ${reason}`);
}

function buildKeywordSelector(keyword: string): string {
    const escaped = keyword.trim().replace(/"/g, '\"');
    return `img[alt*="${escaped}" i], img[title*="${escaped}" i], img[src*="${escaped}" i], img[data-src*="${escaped}" i], img[data-srcset*="${escaped}" i]`;
}

function normalizeText(value: string | null | undefined): string {
    return (value || '').replace(/\s+/g, ' ').trim();
}
