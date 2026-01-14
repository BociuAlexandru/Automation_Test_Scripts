import { expect, Locator, Page, test } from '@playwright/test';

type SlotDetail = {
    title: string;
    href: string;
};

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
    NewsletterClose: '.wof-close.wof-close-icon',
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

const normalizeProviderText = (value: string) =>
    value.replace(/×/g, 'x').replace(/\s+/g, ' ').trim().toLowerCase();

const normalizeSlotTypeText = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

const clickIfVisible = async (locator: Locator, timeout = 1000) => {
    if ((await locator.count()) === 0) return false;
    const isVisible = await locator.isVisible().catch(() => false);
    if (!isVisible) return false;
    await locator.click({ timeout });
    return true;
};

const acceptCookiesIfPresent = async (page: Page) => {
    const allowAll = page.locator(SELECTORS.CookieAllowAll).first();
    if (await clickIfVisible(allowAll, 5000)) return true;
    for (const selector of SELECTORS.CookieAcceptButtons) {
        const button = page.locator(selector).first();
        if (await clickIfVisible(button, 2000)) return true;
    }
    return false;
};

const closeNewsletterIfPresent = async (page: Page) => {
    await clickIfVisible(page.locator(SELECTORS.NewsletterClose).first(), 1000);
};

const closeOfferPopupIfPresent = async (page: Page) => {
    await clickIfVisible(page.locator(SELECTORS.OfferClose).first(), 1000);
};

const dismissInterferingPopups = async (page: Page) => {
    await Promise.allSettled([closeNewsletterIfPresent(page), closeOfferPopupIfPresent(page)]);
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

const collectProducerNamesFromSlots = async (page: Page) => {
    await waitForFilteredSlots(page);
    return page.$$eval(
        SELECTORS.FilteredSlotCard,
        (cards, producerSelector) =>
            cards
                .map((card) => {
                    const producer = card.querySelector(producerSelector as string);
                    return producer?.textContent?.trim() ?? '';
                })
                .filter(Boolean),
        SELECTORS.ProducerName,
    );
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

const collectSlotDetails = async (page: Page): Promise<SlotDetail[]> => {
    await waitForFilteredSlots(page);
    return page.$$eval(
        SELECTORS.FilteredSlotCard,
        (cards, selectors) =>
            cards
                .map((card) => {
                    const cta = card.querySelector(selectors.cta) as HTMLAnchorElement | null;
                    if (!cta || !cta.href) {
                        return null;
                    }
                    const titleNode = card.querySelector(selectors.title);
                    const title = titleNode?.textContent?.trim() ?? cta.textContent?.trim() ?? 'Unknown Slot';
                    return { title, href: cta.href };
                })
                .filter((item): item is SlotDetail => Boolean(item)),
        { cta: SELECTORS.SlotHiddenCta, title: '.slot-name' },
    );
};

const verifySlotTypeForDetails = async (
    page: Page,
    slotDetails: SlotDetail[],
    stepPrefix = 'G5.3',
) => {
    const normalizedExpected = normalizeSlotTypeText(EXPECTED_SLOT_TYPE);

    for (const [index, slot] of slotDetails.entries()) {
        await test.step(`${stepPrefix}.${index + 1} Validate slot type for "${slot.title}"`, async () => {
            const slotPage = await page.context().newPage();
            try {
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
            } finally {
                await slotPage.close().catch(() => null);
            }
        });
    }
};

const getProviderDropdown = (page: Page) => page.locator(SELECTORS.ProviderDropdown).first();

const logStepStatus = (stepName: string, passed: boolean) => {
    const prefix = passed ? '✅' : '❌';
    console.log(`${prefix} ${stepName}`);
};

const runLoggedStep = async <T>(stepName: string, action: () => Promise<T>) => {
    return test.step(stepName, async () => {
        try {
            const result = await action();
            logStepStatus(stepName, true);
            return result;
        } catch (error) {
            logStepStatus(stepName, false);
            throw error;
        }
    });
};

test.describe('P1 Monthly • JP • Games Filters & Pagination', () => {
    test('Combined flow placeholder with implemented G4 provider filter', async ({ page }) => {
        await runLoggedStep('Navigate to archive slot page and prepare UI', async () => {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            await acceptCookiesIfPresent(page);
            await dismissInterferingPopups(page);
        });

        await runLoggedStep('G4.1 Open Furnizori dropdown', async () => {
            await ensureFiltersReady(page);
            const dropdown = page.locator(SELECTORS.ProviderDropdown).first();
            await dropdown.waitFor({ state: 'visible', timeout: 10000 });
            await dropdown.click();
        });

        await runLoggedStep('G4.2 Select 1x2 Gaming provider filter', async () => {
            await ensureFiltersReady(page);
            const option = page.locator(SELECTORS.ProviderOption1x2Gaming).first();
            await option.waitFor({ state: 'visible', timeout: 10000 });
            await option.click();
            await page.waitForTimeout(WAIT_AFTER_FILTER_MS);

            const slotCards = await waitForFilteredSlots(page);
            const slotCount = await slotCards.count();
            console.log(`ℹ️ Detected ${slotCount} slot(s) after provider filter.`);
        });

        await runLoggedStep('G4.3 Validate filtered slots show only 1x2 Gaming', async () => {
            await verifyAllSlotsMatchProvider(page);
        });

        await runSlotTypeFilterFlow(page);
        await runCombinedFilterFlow(page);
        await runResetFiltersFlow(page);
    });
});

const runSlotTypeFilterFlow = async (page: Page) => {
    await runLoggedStep('Reset filters to default state', async () => {
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

    await runLoggedStep('G5.1 Open Slot Type dropdown', async () => {
        await ensureFiltersReady(page);
        const slotTypeDropdown = page.locator(SELECTORS.SlotTypeDropdown).first();
        await slotTypeDropdown.waitFor({ state: 'visible', timeout: 10000 });
        await slotTypeDropdown.click();
    });

    await runLoggedStep('G5.2 Select "Păcănele cu fructe" slot type', async () => {
        const fruitOption = page.locator(SELECTORS.SlotTypeFruitOption).first();
        await fruitOption.waitFor({ state: 'visible', timeout: 10000 });
        await fruitOption.click();
        await page.waitForTimeout(WAIT_AFTER_FILTER_MS);
        const slotCards = await waitForFilteredSlots(page);
        const slotCount = await slotCards.count();
        console.log(`ℹ️ Detected ${slotCount} slot(s) after slot type filter.`);
    });

    await runLoggedStep('G5.3 Validate filtered slots belong to the selected slot type', async () => {
        const slotDetails = await collectSlotDetails(page);
        expect(slotDetails.length, 'Slot type filter should return slots to validate.').toBeGreaterThan(0);
        await verifySlotTypeForDetails(page, slotDetails, 'G5.3');
    });
};

const runCombinedFilterFlow = async (page: Page) => {
    await runLoggedStep('G6.1 Reapply provider filter with fruit slot type active', async () => {
        const dropdown = getProviderDropdown(page);
        await ensureFiltersReady(page);
        await dropdown.waitFor({ state: 'visible', timeout: 10000 });
        await dropdown.click();
        const providerOption = page.locator(SELECTORS.ProviderOption1x2Gaming).first();
        await providerOption.waitFor({ state: 'visible', timeout: 10000 });
        await providerOption.click();
        await page.waitForTimeout(WAIT_AFTER_FILTER_MS);
    });

    await runLoggedStep('G6.2 Count slots returned by combined filters', async () => {
        const slotCards = await waitForFilteredSlots(page);
        const slotCount = await slotCards.count();
        console.log(`ℹ️ Detected ${slotCount} slot(s) under combined filters.`);
        expect(slotCount, 'Combined filters should still yield results.').toBeGreaterThan(0);
    });

    await runLoggedStep('G6.3 Validate slots satisfy both provider and slot type filters', async () => {
        await verifyAllSlotsMatchProvider(page);
        const slotDetails = await collectSlotDetails(page);
        expect(slotDetails.length, 'Combined filters should provide slots to validate.').toBeGreaterThan(0);
        await verifySlotTypeForDetails(page, slotDetails, 'G6.3');
    });
};

const runResetFiltersFlow = async (page: Page) => {
    await runLoggedStep('G7.1 Reset provider filter to default', async () => {
        const dropdown = getProviderDropdown(page);
        await ensureFiltersReady(page);
        await dropdown.waitFor({ state: 'visible', timeout: 10000 });
        await dropdown.click();
        const defaultOption = page.locator(SELECTORS.ProviderDefaultOption).first();
        await defaultOption.waitFor({ state: 'visible', timeout: 10000 });
        await defaultOption.click();
        await page.waitForTimeout(500);
    });

    await runLoggedStep('G7.2 Reset slot type filter to default', async () => {
        await ensureFiltersReady(page);
        const slotTypeDropdown = page.locator(SELECTORS.SlotTypeDropdown).first();
        await slotTypeDropdown.waitFor({ state: 'visible', timeout: 10000 });
        await slotTypeDropdown.click();
        const defaultOption = page.locator(SELECTORS.SlotTypeDefaultOption).first();
        await defaultOption.waitFor({ state: 'visible', timeout: 10000 });
        await defaultOption.click();
        await page.waitForTimeout(500);
    });

    await runLoggedStep('G7.3 Confirm slot grid resets to default state', async () => {
        await waitForNoFilteredSlots(page);
        const filteredCount = await page.locator(SELECTORS.FilteredSlotCard).count();
        expect(filteredCount, 'Filtered slots should not remain after reset.').toBe(0);
    });
};

