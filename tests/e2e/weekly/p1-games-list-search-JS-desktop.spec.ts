import { test, expect, Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import path from 'path';

const BASE_URL = 'https://jocsloturi.ro/sloturi-online-gratis/';
const SUPPORTED_PROJECTS = new Set(['jocsloturi']);
const MAX_SLOTS_TO_TEST = 3;
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

const csvEscape = (value: unknown) => {
    if (value === null || value === undefined) return '""';
    const str = String(value).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ');
    return `"${str}"`;
};

const getCsvFilePath = (projectName: string) =>
    path.join(CSV_FAILURE_DIR, `${projectName}_p1-games-list-search-JS-desktop_${RUN_TIMESTAMP}.csv`);

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
        // ignore url fetch errors
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

const LIST_SLOT_CARD_SELECTOR = '.slot-item';
const LIST_SLOT_IMAGE_SELECTOR = '.slot-image';
const LIST_SLOT_CTA_SELECTOR = '.slot-image-content a.button.button-orange-gradient[href*="/jocuri-cu-sloturi/"]';
const DEMO_CTA_SELECTOR = '#play___game, a.slot-button.button.background-orange-gradient';
const NEWSLETTER_CLOSE_SELECTOR =
    '.madrone-close, .CloseButton__ButtonElement-sc-79mh24-0, button.madrone-close';

const randomDelay = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

const slotListLocator = (page: Page) =>
    page.locator(LIST_SLOT_CTA_SELECTOR).filter({ hasText: /joac[aă]\s+gratis/i });

const slotCardsLocator = (page: Page) =>
    page.locator(LIST_SLOT_CARD_SELECTOR).filter({ has: page.locator(LIST_SLOT_CTA_SELECTOR) });

const getSlotCardByIndex = async (page: Page, slotIndex: number) => {
    const cards = slotCardsLocator(page);
    const count = await cards.count();
    if (slotIndex >= count) {
        throw new Error(`Requested slot card index ${slotIndex} but only ${count} cards found.`);
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

    const slotImage = slotCard.locator(LIST_SLOT_IMAGE_SELECTOR).first();
    if ((await slotImage.count()) > 0) {
        await slotImage.hover();
    } else {
        await slotCard.hover();
    }

    const slotCta = slotCard.locator(LIST_SLOT_CTA_SELECTOR).filter({ hasText: /joac[aă]\s+gratis/i }).first();
    await slotCta.waitFor({ state: 'attached', timeout: 5000 });

    if (!(await slotCta.isVisible())) {
        await forceRevealSlotOverlay(slotCard, page);
        await page.waitForTimeout(200);
    }

    if (!(await slotCta.isVisible())) {
        const ctaHandle = await slotCta.elementHandle();
        if (ctaHandle) {
            await page.evaluate(
                (el) => {
                    el.classList.remove('d-none');
                    el.parentElement?.classList.remove('d-none');
                    el.setAttribute(
                        'style',
                        `${el.getAttribute('style') || ''};opacity:1 !important;visibility:visible !important;display:inline-flex !important;pointer-events:auto !important;transform:none !important;`,
                    );
                    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
                },
                ctaHandle,
            );
            await page.waitForTimeout(150);
        }
    }

    await expect(slotCta).toBeVisible({ timeout: 3000 });
    return slotCta;
};

const getSlotCtaByIndex = async (page: Page, slotIndex: number) => {
    const card = await getSlotCardByIndex(page, slotIndex);
    return ensureSlotCtaVisible(card, page);
};

const acceptCookiesIfPresent = async (page: Page) => {
    const selectors = [
        '#CybotCookiebotDialogBodyButtonDecline',
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
        'button:has-text("Acceptă")',
        'button:has-text("Acceptă selecția")',
        'button:has-text("Accept")',
        'button:has-text("De acord")',
    ];

    for (const selector of selectors) {
        const button = page.locator(selector).first();
        if ((await button.count()) > 0 && (await button.isVisible())) {
            await button.click({ delay: randomDelay(40, 120) });
            await page.waitForTimeout(randomDelay(200, 350));
            verboseLog(`Cookies banner dismissed via selector: ${selector}`);
            return true;
        }
    }

    return false;
};

const closeNewsletterPopupIfPresent = async (page: Page) => {
    const closeButton = page.locator(NEWSLETTER_CLOSE_SELECTOR).first();
    if ((await closeButton.count()) > 0 && (await closeButton.isVisible())) {
        await closeButton.click({ delay: randomDelay(40, 100) });
        await page.waitForTimeout(randomDelay(200, 350));
        verboseLog('Newsletter popup dismissed.');
        return true;
    }

    return false;
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

const ensureReturnToListPage = async (page: Page, maxAttempts = 3) => {
    const normalizedTarget = normalizeUrl(BASE_URL);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const currentNormalized = normalizeUrl(page.url());
        if (currentNormalized.startsWith(normalizedTarget)) {
            verboseLog(`Already on the list page after ${attempt - 1} back operations.`);
            return;
        }

        try {
            await page.goBack();
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(650);
            verboseLog(`Back navigation attempt ${attempt}/${maxAttempts}: ${page.url()}`);
        } catch (error) {
            verboseWarn(`goBack failed on attempt ${attempt}:`, error);
        }
    }

    if (!normalizeUrl(page.url()).startsWith(normalizedTarget)) {
        verboseWarn('Max back attempts reached. Navigating directly to the list page as fallback.');
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle');
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

test('P1: Jocsloturi slot list demo smoke (desktop)', async ({ page }, testInfo) => {
    const currentProject = testInfo.project.name;
    if (currentProject && !SUPPORTED_PROJECTS.has(currentProject)) {
        test.skip(true, `JS desktop spec only runs for: ${Array.from(SUPPORTED_PROJECTS).join(', ')}`);
        return;
    }
    const projectName = currentProject ?? 'p1-games-list-search-JS-desktop';

    await runAuditedStep(page, projectName, '1. Navigate to the slot list page', async () => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await acceptCookiesIfPresent(page);
        await closeNewsletterPopupIfPresent(page);
        await page.waitForLoadState('networkidle');
    });

    let availableSlots = await slotListLocator(page).count();
    if (availableSlots === 0) {
        throw new Error('No "Joacă gratis" CTAs were found on the slot list page.');
    }

    const slotsToTest = Math.min(MAX_SLOTS_TO_TEST, availableSlots);

    for (let index = 0; index < slotsToTest; index++) {
        const slotNumber = index + 1;
        await runAuditedStep(page, projectName, `2.${slotNumber} Click slot ${slotNumber} CTA from list`, async () => {
            const slotCta = await getSlotCtaByIndex(page, index);
            await expect(slotCta).toBeVisible({ timeout: 5000 });

            await forceSameTabNavigation(slotCta);
            const slotTitle = (await slotCta.getAttribute('title')) ?? `slot-${slotNumber}`;
            const slotHref = (await slotCta.getAttribute('href')) ?? '';

            await slotCta.scrollIntoViewIfNeeded();
            await slotCta.hover();

            await Promise.all([
                page.waitForLoadState('domcontentloaded'),
                slotCta.click({ delay: randomDelay(60, 140) }),
            ]);

            await page.waitForTimeout(800);

            await acceptCookiesIfPresent(page);
            await closeNewsletterPopupIfPresent(page);
        });

        await runAuditedStep(page, projectName, `3.${slotNumber} Launch demo for slot ${slotNumber}`, async () => {
            const demoButton = page.locator(DEMO_CTA_SELECTOR).filter({ hasText: /joac[aă]\s+gratis/i }).first();
            await expect(demoButton).toBeVisible({ timeout: 15000 });
            await demoButton.scrollIntoViewIfNeeded();
            await demoButton.hover();
            await demoButton.click({ delay: randomDelay(70, 140) });

            const waitDuration = randomDelay(3000, 4000);
            await page.waitForTimeout(waitDuration);
        });

        await runAuditedStep(page, projectName, `4.${slotNumber} Return to the slot list`, async () => {
            await ensureReturnToListPage(page);
            await page.waitForLoadState('networkidle');
            await expect(page).toHaveURL(new RegExp(`^${normalizeUrl(BASE_URL).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

            await acceptCookiesIfPresent(page);
            await closeNewsletterPopupIfPresent(page);
            availableSlots = await slotListLocator(page).count();
        });
    }
});
