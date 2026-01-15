import { devices, expect, Frame, Locator, Page, test } from '@playwright/test';
import * as fs from 'fs';
import path from 'path';

type SlotDetail = {
    title: string;
    href: string;
};

const { defaultBrowserType: _ignored, ...iPhone13Descriptor } = devices['iPhone 13'];

test.use({
    ...iPhone13Descriptor,
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    permissions: ['geolocation'],
    ignoreHTTPSErrors: true,
});

const BASE_URL = 'https://jocpacanele.ro/jocuri-pacanele/';

const SELECTORS = {
    CookieAllowAll: '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    CookieAcceptButtons: [
        '#CybotCookiebotDialogBodyButtonAccept',
        '.cky-btn-accept',
        '.cc-allow',
        'button:has-text("Acceptă")',
        'button:has-text("Accept")',
    ],
    NewsletterClose: 'div.wof-close.wof-close-icon',
    OfferClose: '.sticky-offer-close',
    ProviderDropdown: '.custom-select:has(#custom_filter_game_producers) .selected-item',
    ProviderOption1x2Gaming:
        '.custom-select:has(#custom_filter_game_producers) .all-items .item:has-text("1×2 Gaming")',
    ProviderDefaultOption:
        '.custom-select:has(#custom_filter_game_producers) .all-items .item:has-text("Furnizori de păcănele")',
    ProducerName: '.producer-name',
    FilteredSlotCard: '#slots_from_filter_container .slot-card',
    SlotTypeDropdown: '.custom-select:has(#custom_filter_slot_types) .selected-item',
    SlotTypeFruitOption:
        '.custom-select:has(#custom_filter_slot_types) .all-items .item:has-text("Păcănele cu fructe")',
    SlotTypeDefaultOption:
        '.custom-select:has(#custom_filter_slot_types) .all-items .item:has-text("Tipuri de păcănele")',
    SlotHiddenCta: '.btn.btn-lg.btn--2',
    SlotCategoryRow: '.single__table__item',
    SlotCategoryLabel: '.single__table__left-col',
};

const EXPECTED_PROVIDER = '1x2 gaming';
const EXPECTED_SLOT_TYPE = 'Păcănele cu fructe';
const WAIT_AFTER_FILTER_MS = 2500;
const VERBOSE_LOGGING = false;
const CSV_FAILURE_DIR = path.join(process.cwd(), 'failures');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const CSV_HEADER = 'Project,Step,Details,URL,Error Message\n';
const INITIALIZED_CSV_FILES = new Set<string>();

const normalizeProviderText = (value: string) =>
    value.replace(/×/g, 'x').replace(/\s+/g, ' ').trim().toLowerCase();

const normalizeSlotTypeText = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

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
    if (value === null || value === undefined) {
        return '""';
    }
    const stringValue = String(value);
    if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
};

const getCsvFilePath = (projectName: string) => {
    const safeName = projectName.replace(/[^\w.-]+/g, '_');
    return path.join(CSV_FAILURE_DIR, `${safeName}_p1-games-filters-JP-mobile_${RUN_TIMESTAMP}.csv`);
};

const ensureCsvInitialized = (projectName: string) => {
    const csvPath = getCsvFilePath(projectName);
    if (INITIALIZED_CSV_FILES.has(csvPath)) {
        return csvPath;
    }
    if (!fs.existsSync(CSV_FAILURE_DIR)) {
        fs.mkdirSync(CSV_FAILURE_DIR, { recursive: true });
    }
    INITIALIZED_CSV_FILES.add(csvPath);
    fs.writeFileSync(csvPath, CSV_HEADER, { encoding: 'utf8' });
    return csvPath;
};

const appendFailureRow = (projectName: string, csvRow: string) => {
    const csvPath = ensureCsvInitialized(projectName);
    fs.appendFileSync(csvPath, `${csvRow}\n`, { encoding: 'utf8' });
};

const logStepFailure = (projectName: string, stepName: string, details: string, page: Page, error: unknown) => {
    const row = [
        csvEscape(projectName),
        csvEscape(stepName),
        csvEscape(details),
        csvEscape(page.url()),
        csvEscape(error instanceof Error ? error.message : String(error)),
    ].join(',');
    appendFailureRow(projectName, row);
    verboseWarn(`Logged failure for step "${stepName}"`, error);
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
    return test.step(stepName, async () => {
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

const tapOrClick = async (locator: Locator, timeout = 1000) => {
    try {
        await locator.tap({ timeout });
        return true;
    } catch {
        try {
            await locator.click({ timeout, force: true });
            return true;
        } catch {
            return false;
        }
    }
};

const getInteractionScopes = (page: Page): (Page | Frame)[] => [page, ...page.frames()];

const clickSelectorInScopes = async (page: Page, selector: string, timeout = 1000) => {
    for (const scope of getInteractionScopes(page)) {
        const target = scope.locator(selector).first();
        if ((await target.count()) === 0) continue;
        const visible = await target.isVisible().catch(() => false);
        if (!visible) {
            await target.waitFor({ state: 'visible', timeout: 500 }).catch(() => null);
        }
        if (await tapOrClick(target, timeout)) {
            return true;
        }
    }
    return false;
};

const isPageScope = (scope: Page | Frame): scope is Page => 'waitForTimeout' in scope;

const waitInScope = async (scope: Page | Frame, durationMs: number) => {
    if (isPageScope(scope)) {
        await scope.waitForTimeout(durationMs);
    } else {
        await scope.page().waitForTimeout(durationMs);
    }
};

const dismissPopupIfPresent = async (scope: Page | Frame, selector: string, attempts = 4) => {
    const target = scope.locator(selector).first();
    if ((await target.count()) === 0) {
        return false;
    }

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        await target.scrollIntoViewIfNeeded().catch(() => null);
        const isVisible = await target.isVisible().catch(() => false);
        if (!isVisible) {
            await target.waitFor({ state: 'visible', timeout: 500 }).catch(() => null);
        }
        if (await tapOrClick(target, 1000)) {
            await waitInScope(scope, 100);
            return true;
        }
    }
    return false;
};

const acceptCookiesIfPresent = async (page: Page) => {
    const selectors = [SELECTORS.CookieAllowAll, ...SELECTORS.CookieAcceptButtons];
    for (const selector of selectors) {
        if (await clickSelectorInScopes(page, selector, 1500)) {
            return true;
        }
    }
    return false;
};

const closeNewsletterIfPresent = async (page: Page) => {
    const scopes: (Page | Frame)[] = [page, ...page.frames()];
    for (const scope of scopes) {
        if (await dismissPopupIfPresent(scope, SELECTORS.NewsletterClose)) {
            return true;
        }
    }
    return false;
};

const closeOfferPopupIfPresent = async (page: Page) => {
    await dismissPopupIfPresent(page, SELECTORS.OfferClose);
};

const dismissInterferingPopups = async (page: Page) => {
    await Promise.allSettled([
        acceptCookiesIfPresent(page),
        closeNewsletterIfPresent(page),
        closeOfferPopupIfPresent(page),
    ]);
};

const ensureFiltersReady = async (page: Page) => {
    await dismissInterferingPopups(page);
};

const waitForFilteredSlots = async (page: Page) => {
    const slotCards = page.locator(SELECTORS.FilteredSlotCard);
    await slotCards.first().waitFor({ state: 'visible', timeout: 20000 });
    return slotCards;
};

const waitForNoFilteredSlots = async (page: Page) => {
    await page
        .waitForFunction(
            (selector) => document.querySelectorAll(selector).length === 0,
            SELECTORS.FilteredSlotCard,
            { timeout: 10000 },
        )
        .catch(() => null);
};

const tapSlotCardImage = async (page: Page, card: Locator) => {
    const candidateSelectors = ['picture', 'img', '.slot-card__image', '.slot-card__thumb', '.slot-card__preview'];
    for (const selector of candidateSelectors) {
        const target = card.locator(selector).first();
        if ((await target.count()) > 0) {
            await target.scrollIntoViewIfNeeded().catch(() => card.scrollIntoViewIfNeeded());
            await target.tap().catch(async () => {
                await target.click({ force: true });
            });
            await page.waitForTimeout(150);
            return;
        }
    }

    await card.scrollIntoViewIfNeeded().catch(() => null);
    await card.tap().catch(async () => {
        await card.click({ force: true });
    });
    await page.waitForTimeout(150);
};

const ensureSlotCardOverlayVisible = async (page: Page, card: Locator) => {
    const producer = card.locator(SELECTORS.ProducerName).first();
    const cta = card.locator(SELECTORS.SlotHiddenCta).first();
    const producerVisible = await producer.isVisible().catch(() => false);
    const ctaVisible = await cta.isVisible().catch(() => false);
    if (producerVisible && ctaVisible) {
        return;
    }

    await tapSlotCardImage(page, card);
    await card.evaluate((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.classList.add('active');
        const hover = node.querySelector('.slot-card__hover');
        if (hover instanceof HTMLElement) {
            hover.classList.remove('hidden');
            hover.style.opacity = '1';
            hover.style.pointerEvents = 'auto';
            hover.style.visibility = 'visible';
        }
        const buttons = node.querySelectorAll('.slot-card__hover a, .slot-card__actions a');
        buttons.forEach((element) => {
            if (element instanceof HTMLElement) {
                element.style.opacity = '1';
                element.style.pointerEvents = 'auto';
                element.style.visibility = 'visible';
                element.style.display = element.style.display || 'inline-flex';
            }
        });
    }).catch(() => null);
    await Promise.race([
        producer.waitFor({ state: 'visible', timeout: 2000 }).catch(() => null),
        cta.waitFor({ state: 'visible', timeout: 2000 }).catch(() => null),
    ]);
};

const collectProducerNamesFromSlots = async (page: Page) => {
    const slotCards = await waitForFilteredSlots(page);
    const names: string[] = [];
    const total = await slotCards.count();

    for (let index = 0; index < total; index += 1) {
        const card = slotCards.nth(index);
        await ensureSlotCardOverlayVisible(page, card);
        const label = (await card.locator(SELECTORS.ProducerName).first().textContent())?.trim() ?? '';
        if (label) {
            names.push(label);
        }
    }

    return names;
};

const verifyAllSlotsMatchProvider = async (page: Page) => {
    const producerLabels = await collectProducerNamesFromSlots(page);
    expect(producerLabels.length, 'Filtered grid should render at least one slot').toBeGreaterThan(0);

    for (const label of producerLabels) {
        const normalized = normalizeProviderText(label);
        expect(
            normalized.includes(EXPECTED_PROVIDER),
            `Slot producer mismatch. Expected "${EXPECTED_PROVIDER}", got "${normalized}"`,
        ).toBeTruthy();
    }
};

const collectSlotDetailsForMobile = async (page: Page): Promise<SlotDetail[]> => {
    const slotCards = await waitForFilteredSlots(page);
    const total = await slotCards.count();
    const details: SlotDetail[] = [];

    for (let index = 0; index < total; index += 1) {
        const card = slotCards.nth(index);
        await ensureSlotCardOverlayVisible(page, card);
        const cta = card.locator(SELECTORS.SlotHiddenCta).first();
        await cta.waitFor({ state: 'attached', timeout: 10000 });
        const href = (await cta.getAttribute('href')) ?? '';
        if (!href) continue;

        let resolvedHref = href;
        try {
            resolvedHref = new URL(href, BASE_URL).toString();
        } catch {
            // keep original href
        }

        const title =
            (await card.locator('.slot-name').first().textContent())?.trim() ??
            (await cta.textContent())?.trim() ??
            'Unknown Slot';
        details.push({ title, href: resolvedHref });
    }

    return details;
};

const verifySlotTypeForDetails = async (
    page: Page,
    projectName: string,
    slotDetails: SlotDetail[],
    stepPrefix = 'G5.3',
) => {
    const normalizedExpected = normalizeSlotTypeText(EXPECTED_SLOT_TYPE);

    for (const [index, slot] of slotDetails.entries()) {
        const slotPage = await page.context().newPage();
        try {
            await runAuditedStep(
                slotPage,
                projectName,
                `${stepPrefix}.${index + 1} Validate slot type for "${slot.title}"`,
                async () => {
                    await slotPage.goto(slot.href, { waitUntil: 'domcontentloaded' });
                    const categoryRow = slotPage
                        .locator(SELECTORS.SlotCategoryRow)
                        .filter({
                            has: slotPage.locator(SELECTORS.SlotCategoryLabel).filter({ hasText: 'Categorie' }),
                        })
                        .first();
                    await categoryRow.waitFor({ state: 'visible', timeout: 15000 });
                    const anchorTexts = await categoryRow.locator('a').allInnerTexts();
                    const normalizedAnchors = anchorTexts.map(normalizeSlotTypeText);

                    expect(
                        normalizedAnchors.some((label) => label.includes(normalizedExpected)),
                        `Slot "${slot.title}" is missing expected "${EXPECTED_SLOT_TYPE}" slot type.`,
                    ).toBeTruthy();
                },
            );
        } finally {
            await slotPage.close().catch(() => null);
        }
    }
};

const getProviderDropdown = (page: Page) => page.locator(SELECTORS.ProviderDropdown).first();

const scrollFiltersIntoView = async (page: Page) => {
    const dropdown = getProviderDropdown(page);
    await dropdown.waitFor({ state: 'visible', timeout: 15000 });
    await dropdown.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
};

test.describe('P1 Monthly • JP • Games Filters & Pagination • Mobile', () => {
    test('Runs G4–G7 flow on iPhone 13 viewport', async ({ page }, testInfo) => {
        const projectName = testInfo.project.name ?? 'p1-games-filters-JP-mobile';

        await runAuditedStep(page, projectName, 'Navigate to archive slot page and prepare UI', async () => {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            void dismissInterferingPopups(page);
            await scrollFiltersIntoView(page);
        });

        await runAuditedStep(page, projectName, 'G4.1 Open Furnizori dropdown', async () => {
            await ensureFiltersReady(page);
            const dropdown = getProviderDropdown(page);
            await dropdown.click();
        });

        await runAuditedStep(page, projectName, 'G4.2 Select 1x2 Gaming provider filter', async () => {
            await ensureFiltersReady(page);
            const dropdown = getProviderDropdown(page);
            await dropdown.click();
            const option = page.locator(SELECTORS.ProviderOption1x2Gaming).first();
            await option.waitFor({ state: 'visible', timeout: 10000 });
            await option.click();
            await page.waitForTimeout(WAIT_AFTER_FILTER_MS);

            const slotCards = await waitForFilteredSlots(page);
            const slotCount = await slotCards.count();
            verboseLog(`Detected ${slotCount} slot(s) after provider filter.`);
        });

        await runAuditedStep(page, projectName, 'G4.3 Validate filtered slots show only 1x2 Gaming', async () => {
            await verifyAllSlotsMatchProvider(page);
        });

        await runSlotTypeFilterFlow(page, projectName);
        await runCombinedFilterFlow(page, projectName);
        await runResetFiltersFlow(page, projectName);
    });
});

const runSlotTypeFilterFlow = async (page: Page, projectName: string) => {
    await runAuditedStep(page, projectName, 'Reset filters to default state', async () => {
        const dropdown = getProviderDropdown(page);
        await ensureFiltersReady(page);
        await dropdown.waitFor({ state: 'visible', timeout: 15000 });
        await dropdown.scrollIntoViewIfNeeded();
        await dropdown.click();

        const defaultOption = page.locator(SELECTORS.ProviderDefaultOption).first();
        await defaultOption.waitFor({ state: 'visible', timeout: 10000 });
        await defaultOption.click();
        await waitForNoFilteredSlots(page);
    });

    await runAuditedStep(page, projectName, 'G5.1 Open Slot Type dropdown', async () => {
        await ensureFiltersReady(page);
        const slotTypeDropdown = page.locator(SELECTORS.SlotTypeDropdown).first();
        await slotTypeDropdown.waitFor({ state: 'visible', timeout: 10000 });
        await slotTypeDropdown.click();
    });

    await runAuditedStep(page, projectName, 'G5.2 Select "Păcănele cu fructe" slot type', async () => {
        const fruitOption = page.locator(SELECTORS.SlotTypeFruitOption).first();
        await fruitOption.waitFor({ state: 'visible', timeout: 10000 });
        await fruitOption.click();
        await page.waitForTimeout(WAIT_AFTER_FILTER_MS);
        const slotCards = await waitForFilteredSlots(page);
        const slotCount = await slotCards.count();
        verboseLog(`Detected ${slotCount} slot(s) after slot type filter.`);
    });

    await runAuditedStep(page, projectName, 'G5.3 Validate filtered slots belong to the selected slot type', async () => {
        const slotDetails = await collectSlotDetailsForMobile(page);
        expect(slotDetails.length, 'Slot type filter should return slots to validate.').toBeGreaterThan(0);
        await verifySlotTypeForDetails(page, projectName, slotDetails, 'G5.3');
    });
};

const runCombinedFilterFlow = async (page: Page, projectName: string) => {
    await runAuditedStep(page, projectName, 'G6.1 Reapply provider filter with fruit slot type active', async () => {
        const dropdown = getProviderDropdown(page);
        await ensureFiltersReady(page);
        await dropdown.waitFor({ state: 'visible', timeout: 10000 });
        await dropdown.click();
        const providerOption = page.locator(SELECTORS.ProviderOption1x2Gaming).first();
        await providerOption.waitFor({ state: 'visible', timeout: 10000 });
        await providerOption.click();
        await page.waitForTimeout(WAIT_AFTER_FILTER_MS);
    });

    await runAuditedStep(page, projectName, 'G6.2 Count slots returned by combined filters', async () => {
        const slotCards = await waitForFilteredSlots(page);
        const slotCount = await slotCards.count();
        verboseLog(`Detected ${slotCount} slot(s) under combined filters.`);
        expect(slotCount, 'Combined filters should still yield results.').toBeGreaterThan(0);
    });

    await runAuditedStep(page, projectName, 'G6.3 Validate slots satisfy both provider and slot type filters', async () => {
        await verifyAllSlotsMatchProvider(page);
        const slotDetails = await collectSlotDetailsForMobile(page);
        expect(slotDetails.length, 'Combined filters should provide slots to validate.').toBeGreaterThan(0);
        await verifySlotTypeForDetails(page, projectName, slotDetails, 'G6.3');
    });
};

const runResetFiltersFlow = async (page: Page, projectName: string) => {
    await runAuditedStep(page, projectName, 'G7.1 Reset provider filter to default', async () => {
        const dropdown = getProviderDropdown(page);
        await ensureFiltersReady(page);
        await dropdown.waitFor({ state: 'visible', timeout: 10000 });
        await dropdown.click();
        const defaultOption = page.locator(SELECTORS.ProviderDefaultOption).first();
        await defaultOption.waitFor({ state: 'visible', timeout: 10000 });
        await defaultOption.click();
        await page.waitForTimeout(500);
    });

    await runAuditedStep(page, projectName, 'G7.2 Reset slot type filter to default', async () => {
        await ensureFiltersReady(page);
        const slotTypeDropdown = page.locator(SELECTORS.SlotTypeDropdown).first();
        await slotTypeDropdown.waitFor({ state: 'visible', timeout: 10000 });
        await slotTypeDropdown.click();
        const defaultOption = page.locator(SELECTORS.SlotTypeDefaultOption).first();
        await defaultOption.waitFor({ state: 'visible', timeout: 10000 });
        await defaultOption.click();
        await page.waitForTimeout(500);
    });

    await runAuditedStep(page, projectName, 'G7.3 Confirm slot grid resets to default state', async () => {
        await waitForNoFilteredSlots(page);
        const filteredCount = await page.locator(SELECTORS.FilteredSlotCard).count();
        expect(filteredCount, 'Filtered slots should not remain after reset.').toBe(0);
    });
};
