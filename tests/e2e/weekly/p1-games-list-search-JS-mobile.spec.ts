import { test, expect, devices, Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import path from 'path';

// --- DEVICE SETUP -----------------------------------------------------------
// Reuse the iPhone 13 descriptor so this spec mirrors a real mobile user.
const { defaultBrowserType: _ignored, ...iPhone13Descriptor } = devices['iPhone 13'];

test.use({
    ...iPhone13Descriptor,
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    permissions: ['geolocation'],
    ignoreHTTPSErrors: true,
});

// --- CONSTANTS --------------------------------------------------------------
const BASE_URL = 'https://jocsloturi.ro/sloturi-online-gratis/';
const SUPPORTED_PROJECTS = new Set(['jocsloturi']);
const MAX_SLOTS_TO_TEST = 3;
const VERBOSE_LOGGING = false;
const CSV_FAILURE_DIR = path.join(process.cwd(), 'failures');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const CSV_HEADER = 'Project,Step,Details,URL,Error Message\n';

const LIST_SLOT_CARD_SELECTOR = '.slot-item';
const LIST_SLOT_IMAGE_SELECTOR = '.slot-image';
const LIST_SLOT_CTA_SELECTOR =
    '.slot-image-content a.button.button-orange-gradient[href*="/jocuri-cu-sloturi/"]';
const DEMO_CTA_SELECTOR = '#play___game, a.slot-button.button.background-orange-gradient';

const COOKIE_DENY_SELECTOR = '#CybotCookiebotDialogBodyButtonDecline';
const NEWSLETTER_CLOSE_SELECTOR =
    '.madrone-close, .CloseButton__ButtonElement-sc-79mh24-0, button.madrone-close';
const OFFER_CLOSE_SELECTOR = '.sticky-popup__close';

// --- UTILS ------------------------------------------------------------------
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

const clickIfVisible = async (locator: Locator, label: string) => {
    if ((await locator.count()) === 0) {
        return false;
    }

    const target = locator.first();
    if (!(await target.isVisible().catch(() => false))) {
        return false;
    }

    await target.click({ delay: randomDelay(40, 110) });
    await target.page().waitForTimeout(randomDelay(150, 250));
    verboseLog(`[Popup] Dismissed via ${label}`);
    return true;
};

const acceptCookiesIfPresent = async (page: Page) => {
    const preferredSelectors = [
        COOKIE_DENY_SELECTOR,
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
        'button:has-text("Accept")',
        'button:has-text("De acord")',
        'button:has-text("Acceptă")',
    ];

    for (let attempt = 1; attempt <= 5; attempt++) {
        for (const selector of preferredSelectors) {
            if (await clickIfVisible(page.locator(selector), `selector ${selector}`)) {
                return true;
            }
        }
        await page.waitForTimeout(400);
    }

    return false;
};

const closeNewsletterIfPresent = (page: Page) =>
    clickIfVisible(page.locator(NEWSLETTER_CLOSE_SELECTOR), 'newsletter close button');

const closeOfferPopupIfPresent = (page: Page) =>
    clickIfVisible(page.locator(OFFER_CLOSE_SELECTOR), 'sticky offer close button');

const dismissInterferingPopups = async (page: Page) => {
    await acceptCookiesIfPresent(page);
    await closeNewsletterIfPresent(page);
    await closeOfferPopupIfPresent(page);
};

const slotCardsLocator = (page: Page) => page.locator(LIST_SLOT_CARD_SELECTOR);

const getSlotCardByIndex = async (page: Page, slotIndex: number) => {
    const cards = slotCardsLocator(page);
    const count = await cards.count();
    if (count === 0) {
        throw new Error('No slot cards found on the list page.');
    }
    if (slotIndex >= count) {
        throw new Error(`Requested slot index ${slotIndex} but only ${count} cards exist.`);
    }
    return cards.nth(slotIndex);
};

const forceRevealSlotOverlay = async (slotCard: Locator, page: Page) => {
    const cardHandle = await slotCard.elementHandle();
    if (!cardHandle) {
        return;
    }

    await page.evaluate((card) => {
        card.classList.add('cascade-force-slot');
        const overlay = card.querySelector('.slot-image-content');
        if (overlay) {
            overlay.classList.remove('d-none');
            overlay.setAttribute('data-cascade-force', 'true');
            overlay.setAttribute(
                'style',
                `${overlay.getAttribute('style') || ''};opacity:1 !important;visibility:visible !important;display:flex !important;pointer-events:auto !important;transform:none !important;`,
            );
        }

        const cta = overlay?.querySelector('.button.button-orange-gradient');
        if (cta instanceof HTMLElement) {
            cta.classList.remove('d-none');
            cta.setAttribute(
                'style',
                `${cta.getAttribute('style') || ''};opacity:1 !important;visibility:visible !important;display:inline-flex !important;pointer-events:auto !important;`,
            );
        }
    }, cardHandle);
};

const ensureSlotCtaVisible = async (slotCard: Locator, page: Page) => {
    await slotCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);

    const fallbackTapTarget = slotCard.locator(LIST_SLOT_IMAGE_SELECTOR).first();
    if ((await fallbackTapTarget.count()) > 0) {
        await fallbackTapTarget.tap({ position: { x: 10, y: 10 } }).catch(() => {});
    } else {
        await slotCard.tap().catch(() => {});
    }

    const slotCta = slotCard
        .locator(LIST_SLOT_CTA_SELECTOR)
        .filter({ hasText: /joac[aă]\s+gratis/i })
        .first();
    await slotCta.waitFor({ state: 'attached', timeout: 5000 });

    if (!(await slotCta.isVisible())) {
        await forceRevealSlotOverlay(slotCard, page);
        await page.waitForTimeout(200);
    }

    if (!(await slotCta.isVisible())) {
        const ctaHandle = await slotCta.elementHandle();
        if (ctaHandle) {
            await page.evaluate((el) => {
                el.classList.remove('d-none');
                el.parentElement?.classList.remove('d-none');
                el.setAttribute(
                    'style',
                    `${el.getAttribute('style') || ''};opacity:1 !important;visibility:visible !important;display:inline-flex !important;pointer-events:auto !important;transform:none !important;`,
                );
                el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
            }, ctaHandle);
            await page.waitForTimeout(150);
        }
    }

    await expect(slotCta).toBeVisible({ timeout: 3000 });
    return slotCta;
};

const forceSameTabNavigation = async (locator: Locator) => {
    await locator.evaluate((node) => {
        if (node instanceof HTMLAnchorElement) {
            node.target = '_self';
            node.rel = 'noopener noreferrer';
        }
    });
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
    const current = normalizeUrl(page.url());
    if (current.startsWith(target)) {
        return;
    }

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            await page.goBack();
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(500);
            if (normalizeUrl(page.url()).startsWith(target)) {
                return;
            }
        } catch (error) {
            verboseWarn(`[BackNav] goBack attempt ${attempt} failed`, error);
        }
    }

    verboseWarn('[BackNav] Using direct navigation fallback.');
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
};

const scrollInitialViewport = async (page: Page) => {
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo({ top: 350, behavior: 'instant' }));
};

const csvEscape = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ');
    return `"${str}"`;
};

const getCsvFilePath = (projectName: string) =>
    path.join(CSV_FAILURE_DIR, `${projectName}_p1-games-list-search-JS-mobile_${RUN_TIMESTAMP}.csv`);

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
test('P1 Mobile: Jocsloturi slot list demo smoke', async ({ page }, testInfo) => {
    const currentProject = testInfo.project.name;
    if (currentProject && !SUPPORTED_PROJECTS.has(currentProject)) {
        test.skip(true, `JS mobile spec only runs for: ${Array.from(SUPPORTED_PROJECTS).join(', ')}`);
        return;
    }
    const projectName = currentProject ?? 'p1-games-list-search-JS-mobile';

    await runAuditedStep(page, projectName, '1. Load slot list and dismiss blocking UI', async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await dismissInterferingPopups(page);
        await page.waitForLoadState('networkidle');
        await scrollInitialViewport(page);
    });

    let slotCount = await slotCardsLocator(page).count();
    if (slotCount === 0) {
        throw new Error('No slot cards rendered on the list page.');
    }

    const slotsToTest = Math.min(MAX_SLOTS_TO_TEST, slotCount);

    for (let index = 0; index < slotsToTest; index++) {
        const slotNumber = index + 1;

        await runAuditedStep(page, projectName, `2.${slotNumber} Open slot ${slotNumber} from the list`, async () => {
            const slotCard = await getSlotCardByIndex(page, index);
            const slotCta = await ensureSlotCtaVisible(slotCard, page);
            await forceSameTabNavigation(slotCta);

            await Promise.all([
                page.waitForLoadState('domcontentloaded'),
                slotCta.click({ delay: randomDelay(70, 140) }),
            ]);
            await page.waitForTimeout(700);

            await dismissInterferingPopups(page);
        });

        await runAuditedStep(page, projectName, `3.${slotNumber} Launch demo for slot ${slotNumber}`, async () => {
            const demoButton = page.locator(DEMO_CTA_SELECTOR).filter({ hasText: /joac[aă]\s+gratis/i }).first();
            await expect(demoButton).toBeVisible({ timeout: 15000 });
            await demoButton.scrollIntoViewIfNeeded();
            await demoButton.click({ delay: randomDelay(70, 140) });

            const waitDuration = randomDelay(3000, 4000);
            await page.waitForTimeout(waitDuration);
        });

        await runAuditedStep(page, projectName, `4.${slotNumber} Return to slot list`, async () => {
            await ensureReturnToListPage(page);
            await page.waitForTimeout(600);
            await expect(page).toHaveURL(new RegExp(`^${normalizeUrl(BASE_URL).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`));
            await dismissInterferingPopups(page);
            await scrollInitialViewport(page);
            slotCount = await slotCardsLocator(page).count();
        });
    }
});
