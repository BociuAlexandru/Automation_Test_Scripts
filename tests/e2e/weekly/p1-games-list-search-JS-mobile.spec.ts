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
// Site-specific selectors plus logging/CSV knobs reused across helpers.
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
// Popup dismissal, hover/tap helpers, and CSV logging utilities for Jocsloturi mobile.
const randomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const verboseLog = (...args: unknown[]) => {
    if (VERBOSE_LOGGING) {
        console.log(...args);
    }
};

const waitForSlotNavigation = async (page: Page, expectedHref?: string | null) => {
    const normalizedBase = normalizeUrl(BASE_URL);
    const expectedUrl = expectedHref ? normalizeUrl(new URL(expectedHref, BASE_URL).toString()) : null;

    await page.waitForURL(
        (url) => {
            const normalizedCurrent = normalizeUrl(url.toString());
            if (normalizedCurrent.startsWith(normalizedBase)) {
                return false;
            }
            if (expectedUrl && normalizedCurrent.startsWith(expectedUrl)) {
                return true;
            }
            return url.pathname.includes('/jocuri-cu-sloturi/');
        },
        { timeout: 12000 },
    );
};

const openSlotViaCta = async (slotCta: Locator, page: Page, touch?: (label: string) => void) => {
    const href = await slotCta.getAttribute('href');
    if (!href) {
        throw new Error('Slot CTA is missing an href attribute.');
    }

    const attemptClickNavigation = async () => {
        await Promise.all([
            waitForSlotNavigation(page, href),
            slotCta.click({ delay: randomDelay(70, 140), force: true, noWaitAfter: true }),
        ]);
    };

    try {
        await attemptClickNavigation();
        await page.waitForLoadState('domcontentloaded');
        touch?.('slot-nav-click-success');
        return;
    } catch (error) {
        verboseWarn('[SlotNav] Click navigation failed, attempting direct goto', error);
    }

    await page.goto(href, { waitUntil: 'domcontentloaded' });
    touch?.('slot-nav-direct-goto');
};

const progressiveScrollIntoView = async (
    page: Page,
    locator: Locator,
    maxAttempts = 10,
    touch?: (label: string) => void,
) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const visible = await locator.isVisible({ timeout: 300 }).catch(() => false);
        if (visible) {
            return true;
        }

        await locator.scrollIntoViewIfNeeded().catch(() => null);
        const newlyVisible = await locator.isVisible({ timeout: 300 }).catch(() => false);
        if (newlyVisible) {
            return true;
        }

        await page
            .evaluate(() => {
                window.scrollBy({ top: window.innerHeight * 0.65, behavior: 'instant' });
            })
            .catch(() => null);
        touch?.(`progressive-scroll-${attempt + 1}`);
        await page.waitForTimeout(200);
    }

    return false;
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
    await target.waitFor({ state: 'attached', timeout: 1000 }).catch(() => null);

    const ensureDisplayed = async () => {
        const handle = await target.elementHandle();
        if (!handle) {
            return;
        }
        await target.page().evaluate((el) => {
            if (!(el instanceof HTMLElement)) return;
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            el.style.visibility = 'visible';
            el.style.display = 'inline-flex';
            el.style.transform = 'none';
        }, handle);
    };

    if (!(await target.isVisible().catch(() => false))) {
        await ensureDisplayed();
    }

    const attemptDomClick = async () =>
        target
            .evaluate((node) => {
                if (node instanceof HTMLElement) {
                    node.click();
                }
            })
            .catch(() => {});

    try {
        await target.click({ delay: randomDelay(40, 110), force: true, noWaitAfter: true });
    } catch (error) {
        await attemptDomClick();
    }
    await target.page().waitForTimeout(randomDelay(150, 250));
    verboseLog(`[Popup] Dismissed via ${label}`);
    return true;
};

const acceptCookiesIfPresent = async (page: Page) => {
    const preferredSelectors = [
        COOKIE_DENY_SELECTOR,
        'button#CybotCookiebotDialogBodyButtonDecline.CybotCookiebotDialogBodyButton',
        'button#CybotCookiebotDialogBodyButtonDecline[lang="ro"]',
        'button:has-text("Respinge")',
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
        'button:has-text("Accept")',
        'button:has-text("De acord")',
        'button:has-text("Acceptă")',
    ];

    for (const selector of preferredSelectors) {
        if (await clickIfVisible(page.locator(selector), `selector ${selector}`)) {
            return true;
        }
    }

    return false;
};

const closeNewsletterIfPresent = (page: Page) =>
    clickIfVisible(page.locator(NEWSLETTER_CLOSE_SELECTOR), 'newsletter close button');

const closeOfferPopupIfPresent = (page: Page) =>
    clickIfVisible(page.locator(OFFER_CLOSE_SELECTOR), 'sticky offer close button');

const coaxViewportActivity = async (page: Page) => {
    await page
        .evaluate(() => {
            const delta = Math.max(80, Math.round(window.innerHeight * 0.2));
            window.scrollBy({ top: delta, behavior: 'instant' });
            window.scrollBy({ top: -delta * 0.7, behavior: 'instant' });
            const mouseEvent = new MouseEvent('mousemove', {
                bubbles: true,
                clientX: Math.round(window.innerWidth * 0.4),
                clientY: Math.round(window.innerHeight * 0.2),
            });
            document.dispatchEvent(mouseEvent);
            const touchEvent = new Event('touchstart', { bubbles: true, cancelable: true });
            document.dispatchEvent(touchEvent);
        })
        .catch(() => null);
    await page.waitForTimeout(150);
};

const clearBlockingOverlays = async (page: Page) => {
    const selectors = [
        '.sticky-popup',
        '.sticky-popup__overlay',
        '.sticky-popup__container',
        '.sticky-offer',
        '.wof-overlay',
        '.madrone-modal',
        '.madrone-modal__overlay',
        '.newsletter-popup',
        '.slot-placeholder__offers',
        '#newsletter-modal',
    ];

    await page
        .evaluate((overlaySelectors) => {
            overlaySelectors.forEach((selector) => {
                document.querySelectorAll(selector).forEach((node) => {
                    if (node instanceof HTMLElement) {
                        node.style.opacity = '0';
                        node.style.pointerEvents = 'none';
                        node.style.display = 'none';
                        node.style.visibility = 'hidden';
                        node.style.transform = 'none';
                        node.classList.add('cascade-overlay-hidden');
                    }
                });
            });
        }, selectors)
        .catch(() => null);
};

const forceRevealDemoButton = async (button: Locator) => {
    try {
        await button.evaluate((el) => {
            if (!(el instanceof HTMLElement)) return;
            el.classList.remove('d-none', 'hidden');
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            el.style.visibility = 'visible';
            el.style.display = 'inline-flex';
            el.style.transform = 'none';
            el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        });
        return true;
    } catch {
        return false;
    }
};

const runPopupSweep = async (page: Page, touch?: (label: string) => void) => {
    let dismissed = false;
    if (await acceptCookiesIfPresent(page)) {
        dismissed = true;
        touch?.('cookie-dismissed');
    }
    if (await closeNewsletterIfPresent(page)) {
        dismissed = true;
        touch?.('newsletter-dismissed');
    }
    if (await closeOfferPopupIfPresent(page)) {
        dismissed = true;
        touch?.('offer-dismissed');
    }
    return dismissed;
};

type InactivityWatchdog = {
    touch: (label: string) => void;
    stop: () => void;
};

const startInactivityWatchdog = (page: Page, timeoutMs = 15000): InactivityWatchdog => {
    let lastLabel = 'initialization';
    let timer: NodeJS.Timeout | null = null;

    const schedule = () => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => {
            const message = `[Watchdog] No activity for ${timeoutMs}ms (last: ${lastLabel})`;
            console.error(message);
            throw new Error(message);
        }, timeoutMs);
    };

    const touch = (label: string) => {
        lastLabel = label;
        schedule();
    };

    const events = [
        'request',
        'requestfinished',
        'requestfailed',
        'response',
        'framenavigated',
        'domcontentloaded',
        'load',
        'console',
        'popup',
    ] as const;

    const listeners = events.map((event) => {
        const handler = () => touch(`page:${event}`);
        page.on(event as any, handler);
        return { event, handler };
    });

    schedule();

    return {
        touch,
        stop: () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            listeners.forEach(({ event, handler }) => page.off(event as any, handler));
        },
    };
};

const dismissInterferingPopups = async (
    page: Page,
    opts: { triggerViewport?: boolean; viewportCycles?: number } = {},
    touch?: (label: string) => void,
) => {
    const cycles = opts.triggerViewport ? Math.max(1, opts.viewportCycles ?? 2) : 1;
    for (let attempt = 0; attempt < cycles; attempt++) {
        const cleared = await runPopupSweep(page, touch);
        if (cleared) {
            break;
        }
        if (opts.triggerViewport && attempt < cycles - 1) {
            await coaxViewportActivity(page);
            touch?.('viewport-coax');
        }
    }
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

    const watchdog = startInactivityWatchdog(page, 15000);
    const markActivity = (label: string) => watchdog.touch(`[${projectName}] ${label}`);

    markActivity('test-start');

    try {
        await runAuditedStep(page, projectName, '1. Load slot list and dismiss blocking UI', async () => {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            markActivity('after-goto');
            await dismissInterferingPopups(page, { triggerViewport: true, viewportCycles: 4 }, markActivity);
            markActivity('after-initial-dismiss');
            await page.waitForLoadState('networkidle');
            markActivity('after-networkidle');
            await scrollInitialViewport(page);
            markActivity('after-initial-scroll');
        });

        let slotCount = await slotCardsLocator(page).count();
        if (slotCount === 0) {
            throw new Error('No slot cards rendered on the list page.');
        }

        const slotsToTest = Math.min(MAX_SLOTS_TO_TEST, slotCount);

        for (let index = 0; index < slotsToTest; index++) {
            const slotNumber = index + 1;

            await runAuditedStep(page, projectName, `2.${slotNumber} Open slot ${slotNumber} from the list`, async () => {
                markActivity(`slot-${slotNumber}-prep`);
                const slotCard = await getSlotCardByIndex(page, index);
                const slotCta = await ensureSlotCtaVisible(slotCard, page);
                await forceSameTabNavigation(slotCta);
                await openSlotViaCta(slotCta, page, markActivity);
                markActivity(`slot-${slotNumber}-clicked`);
            });

            await runAuditedStep(page, projectName, `3.${slotNumber} Launch demo for slot ${slotNumber}`, async () => {
                await dismissInterferingPopups(page, { triggerViewport: true }, markActivity);
                await scrollInitialViewport(page);
                markActivity(`slot-${slotNumber}-pre-demo-viewport`);
                await clearBlockingOverlays(page);
                const demoButton = page.locator(DEMO_CTA_SELECTOR).filter({ hasText: /joac[aă]\s+gratis/i }).first();
                await demoButton.waitFor({ state: 'attached', timeout: 15000 });
                await forceRevealDemoButton(demoButton);
                await progressiveScrollIntoView(page, demoButton, 12, markActivity);
                await expect(demoButton).toBeVisible({ timeout: 15000 });
                markActivity(`slot-${slotNumber}-demo-visible`);
                await demoButton.scrollIntoViewIfNeeded();
                await demoButton.click({ delay: randomDelay(70, 140), force: true });

                markActivity(`slot-${slotNumber}-demo-clicked`);
                const waitDuration = randomDelay(3000, 4000);
                await page.waitForTimeout(waitDuration);
            });

            await runAuditedStep(page, projectName, `4.${slotNumber} Return to slot list`, async () => {
                await ensureReturnToListPage(page);
                markActivity(`slot-${slotNumber}-returned`);
                await page.waitForTimeout(600);
                await expect(page).toHaveURL(new RegExp(`^${normalizeUrl(BASE_URL).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
                await dismissInterferingPopups(page, { triggerViewport: true }, markActivity);
                await scrollInitialViewport(page);
                slotCount = await slotCardsLocator(page).count();
            });
        }
    } finally {
        watchdog.stop();
    }
});

// ... (rest of the code remains the same)
