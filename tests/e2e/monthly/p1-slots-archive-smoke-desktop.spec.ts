import { expect, Locator, Page, Response, test } from '@playwright/test';
import path from 'path';
import * as fs from 'fs';

import { SiteName } from '../config/sites';
import {
    buildAbsoluteUrl,
    checkH1Content,
    closeCookiePopupIfPresent,
    closeOptionalPopupIfPresent,
} from '../helpers/mobileMenuUtils';

type SlotArchiveConfig = {
    archivePath: string;
    slotCardSelector: string;
    slotLinkSelector?: string;
    h1Selector?: string;
    paginationNextSelector?: string;
    paginationLimit?: number;
    slotLinkRequiresHover?: boolean;
    slotHoverSelector?: string;
    slotNameSelector?: string;
    loadMoreSelector?: string;
    loadMoreMaxClicks?: number;
    loadMoreAllowedDataIds?: string[];
    loadMorePerButtonLimit?: number;
    multiLoadMore?: boolean;
    forceIsolatedValidation?: boolean;
};

const SLOT_ARCHIVE_CONFIGS: Partial<Record<SiteName, SlotArchiveConfig>> = {
    'casino.com.ro': {
        archivePath: '/sloturi/',
        slotCardSelector: 'div.col-span-1:has(a[href*="/slot/"])',
        slotLinkSelector: 'a[href*="/slot/"]',
        h1Selector: 'h1',
        paginationNextSelector: '.pagination a.next.page-numbers',
        paginationLimit: 30,
    },
    'jocsloturi': {
        archivePath: '/toate-jocuri-gratis/',
        slotCardSelector: '.slot-card',
        slotLinkSelector: '.slot-image-content .button.button-orange-gradient',
        slotHoverSelector: '.slot-item',
        slotLinkRequiresHover: true,
        slotNameSelector: '.slot-info .slot-button-archive',
        h1Selector: 'h1',
        paginationNextSelector: '.ast-pagination a.next.page-numbers',
        paginationLimit: 60,
    },
    'jocpacanele': {
        archivePath: '/jocuri-pacanele/',
        slotCardSelector: '.single_slot_card',
        slotLinkSelector: '.slot-demo-btn, .click-interaction-ajax.btn',
        slotHoverSelector: '.slot-card',
        slotLinkRequiresHover: true,
        slotNameSelector: '.hidden-card .slot-name',
        h1Selector: 'h1',
        loadMoreSelector: '#load-more-button',
        loadMoreMaxClicks: 80,
    },
    'jocuricazinouri': {
        archivePath: '/jocuri-casino-gratis/',
        slotCardSelector: '.card-play',
        slotLinkSelector: '.card-play__wrapper .button--internal',
        slotHoverSelector: '.card-play',
        slotLinkRequiresHover: true,
        slotNameSelector: '.card-play__wrapper .p-h6, .card-play__wrapper p.p-h6',
        h1Selector: 'h1',
        paginationNextSelector: '.posts-pagination .page-item.next a.page-link',
        paginationLimit: 50,
    },
    'supercazino': {
        archivePath: '/sloturi-gratis/',
        slotCardSelector: '.card_inner.single-slot-in-card',
        slotLinkSelector: '.card_inner.single-slot-in-card a.btn.btn--1',
        slotNameSelector: '.card_inner.single-slot-in-card .sc-h4-slot-card',
        h1Selector: 'h1',
        forceIsolatedValidation: true,
    },
};

const SUPPORTED_SLOT_ARCHIVE_PROJECTS = new Set<SiteName>([
    'casino.com.ro',
    'jocsloturi',
    'jocpacanele',
    'jocuricazinouri',
    'supercazino',
    // Future: add more projects here (excluding beturi which has no slots)
]);

const TEST_ID = 'SA1';
const INFO_MARK = '🔍';
const PASS_MARK = '✅';
const FAIL_MARK = '❌';

const BASE_REPORT_DIR = path.join(process.cwd(), 'failures');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const CSV_HEADER = 'Project,Test ID,Failure Type,Details,Failing URL\n';

function getCsvFilePath(projectName: SiteName) {
    return path.join(BASE_REPORT_DIR, `${projectName}_p1-slots-archive-smoke-desktop_${RUN_TIMESTAMP}.csv`);
}

async function processSupercazinoRuleta(
    page: Page,
    siteName: SiteName,
    baseURL: string,
    config: SlotArchiveConfig,
    archiveUrl: string,
    softFailures: string[],
) {
    const section = page.locator('.term-container').filter({ has: page.locator('h2:has-text("Ruletă")') }).first();
    const sectionVisible = await section.isVisible().catch(() => false);
    if (!sectionVisible) {
        const detail = 'Ruletă section not found on archive page.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.section`, 'Missing Category Section', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    const slotCards = section.locator('.card_inner.single-slot-in-card');

    const slotCount = await slotCards.count();
    if (slotCount === 0) {
        const detail = 'No slot cards detected in Ruletă section.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.collect`, 'Missing Slots', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    logInfo(`[${siteName}] Ruletă: detected ${slotCount} slot card(s).`);
    const slotMeta = await collectSupercazinoSlotMeta(slotCards);
    await validateSupercazinoSlotMetaList(
        slotMeta,
        'Ruletă',
        slotCount,
        page,
        siteName,
        baseURL,
        config,
        archiveUrl,
        softFailures,
    );
}

async function processSupercazinoSpeciale(
    page: Page,
    siteName: SiteName,
    baseURL: string,
    config: SlotArchiveConfig,
    archiveUrl: string,
    softFailures: string[],
) {
    const section = page.locator('.term-container').filter({ has: page.locator('h2:has-text("Speciale")') }).first();
    const sectionVisible = await section.isVisible().catch(() => false);
    if (!sectionVisible) {
        const detail = 'Speciale section not found on archive page.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.section`, 'Missing Category Section', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    const slotCards = section.locator('.card_inner.single-slot-in-card');
    await expandSupercazinoSectionWithLoadMore(
        section,
        slotCards,
        '11',
        15,
        page,
        siteName,
        archiveUrl,
        softFailures,
    );

    const slotCount = await slotCards.count();
    if (slotCount === 0) {
        const detail = 'No slot cards detected in Speciale section.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.collect`, 'Missing Slots', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    logInfo(`[${siteName}] Speciale: detected ${slotCount} slot card(s).`);
    const slotMeta = await collectSupercazinoSlotMeta(slotCards);
    await validateSupercazinoSlotMetaList(
        slotMeta,
        'Speciale',
        slotCount,
        page,
        siteName,
        baseURL,
        config,
        archiveUrl,
        softFailures,
    );
}

async function processSupercazinoPacanele7777(
    page: Page,
    siteName: SiteName,
    baseURL: string,
    config: SlotArchiveConfig,
    archiveUrl: string,
    softFailures: string[],
) {
    const section = page.locator('.term-container').filter({ has: page.locator('h2:has-text("Păcănele 7777")') }).first();
    const sectionVisible = await section.isVisible().catch(() => false);
    if (!sectionVisible) {
        const detail = 'Păcănele 7777 section not found on archive page.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.section`, 'Missing Category Section', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    const slotCards = section.locator('.card_inner.single-slot-in-card');
    await expandSupercazinoSectionWithLoadMore(
        section,
        slotCards,
        '49',
        20,
        page,
        siteName,
        archiveUrl,
        softFailures,
    );

    const slotCount = await slotCards.count();
    if (slotCount === 0) {
        const detail = 'No slot cards detected in Păcănele 7777 section.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.collect`, 'Missing Slots', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    logInfo(`[${siteName}] Păcănele 7777: detected ${slotCount} slot card(s).`);
    const slotMeta = await collectSupercazinoSlotMeta(slotCards);
    await validateSupercazinoSlotMetaList(
        slotMeta,
        'Păcănele 7777',
        slotCount,
        page,
        siteName,
        baseURL,
        config,
        archiveUrl,
        softFailures,
    );
}

async function processSupercazinoNoi(
    page: Page,
    siteName: SiteName,
    baseURL: string,
    config: SlotArchiveConfig,
    archiveUrl: string,
    softFailures: string[],
) {
    const section = page.locator('.term-container').filter({ has: page.locator('h2:has-text("Noi")') }).first();
    const sectionVisible = await section.isVisible().catch(() => false);
    if (!sectionVisible) {
        const detail = 'Noi section not found on archive page.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.section`, 'Missing Category Section', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    const slotCards = section.locator('.card_inner.single-slot-in-card');
    await expandSupercazinoSectionWithLoadMore(
        section,
        slotCards,
        '10',
        15,
        page,
        siteName,
        archiveUrl,
        softFailures,
    );

    const slotCount = await slotCards.count();
    if (slotCount === 0) {
        const detail = 'No slot cards detected in Noi section.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.collect`, 'Missing Slots', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    logInfo(`[${siteName}] Noi: detected ${slotCount} slot card(s).`);
    const slotMeta = await collectSupercazinoSlotMeta(slotCards);
    await validateSupercazinoSlotMetaList(
        slotMeta,
        'Noi',
        slotCount,
        page,
        siteName,
        baseURL,
        config,
        archiveUrl,
        softFailures,
    );
}

async function processSupercazinoFructe(
    page: Page,
    siteName: SiteName,
    baseURL: string,
    config: SlotArchiveConfig,
    archiveUrl: string,
    softFailures: string[],
) {
    const section = page.locator('.term-container').filter({ has: page.locator('h2:has-text("Fructe")') }).first();
    const sectionVisible = await section.isVisible().catch(() => false);
    if (!sectionVisible) {
        const detail = 'Fructe section not found on archive page.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.section`, 'Missing Category Section', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    const slotCards = section.locator('.card_inner.single-slot-in-card');
    await expandSupercazinoSectionWithLoadMore(
        section,
        slotCards,
        '16',
        15,
        page,
        siteName,
        archiveUrl,
        softFailures,
    );

    const slotCount = await slotCards.count();
    if (slotCount === 0) {
        const detail = 'No slot cards detected in Fructe section.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.collect`, 'Missing Slots', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    logInfo(`[${siteName}] Fructe: detected ${slotCount} slot card(s).`);
    const slotMeta = await collectSupercazinoSlotMeta(slotCards);
    await validateSupercazinoSlotMetaList(
        slotMeta,
        'Fructe',
        slotCount,
        page,
        siteName,
        baseURL,
        config,
        archiveUrl,
        softFailures,
    );
}

async function processSlotsWithLoadMore(
    page: Page,
    siteName: SiteName,
    baseURL: string,
    config: SlotArchiveConfig,
    archiveUrl: string,
    softFailures: string[],
) {
    logInfo(`[${siteName}] ===== Processing slots with load-more at ${archiveUrl} =====`);
    await closeCookiePopupIfPresent(page, siteName);
    await closeOptionalPopupIfPresent(page, siteName);

    let processed = 0;
    let loadMoreClicks = 0;
    const maxClicks = config.loadMoreMaxClicks ?? 100;
    const multiLoadMore = Boolean(config.multiLoadMore);
    const perButtonClicks: Record<string, number> = {};

    while (true) {
        const slotCards = page.locator(config.slotCardSelector);
        const slotCount = await slotCards.count();

        if (slotCount === 0) {
            const detail = `No slots detected on load-more archive ${archiveUrl}`;
            logFailure(detail);
            logFailureToCsv(siteName, `${TEST_ID}.collect`, 'Missing Slots', detail, archiveUrl);
            softFailures.push(`[${siteName}] ${detail}`);
            return;
        }

        while (processed < slotCount) {
            await testSlotCardByIndex(
                page,
                siteName,
                baseURL,
                config,
                loadMoreClicks + 1,
                archiveUrl,
                processed,
                slotCount,
                softFailures,
            );
            processed += 1;
        }

        if (loadMoreClicks >= maxClicks) {
            logInfo(`[${siteName}] Reached load-more guard (${maxClicks} clicks). Ending.`);
            break;
        }

        if (multiLoadMore) {
            const nextButton = await findNextLoadMoreButton(page, config, perButtonClicks);
            if (!nextButton) {
                logInfo(`[${siteName}] No further load-more buttons available. Ending slot scan.`);
                break;
            }

            const loaded = await triggerLoadMore(
                page,
                siteName,
                config,
                slotCount,
                loadMoreClicks + 1,
                nextButton.button,
                nextButton.descriptor,
            );
            if (nextButton.termId) {
                perButtonClicks[nextButton.termId] = (perButtonClicks[nextButton.termId] ?? 0) + 1;
            }

            if (!loaded) {
                logInfo(`[${siteName}] Load-more target ${nextButton.descriptor} inactive. Trying remaining buttons.`);
                continue;
            }

            loadMoreClicks += 1;
            await closeOptionalPopupIfPresent(page, siteName);
            await closeCookiePopupIfPresent(page, siteName);
            continue;
        }

        const loaded = await triggerLoadMore(
            page,
            siteName,
            config,
            slotCount,
            loadMoreClicks + 1,
        );
        if (!loaded) {
            logInfo(`[${siteName}] Load-more button inactive. Ending slot scan.`);
            break;
        }
        loadMoreClicks += 1;
        await closeOptionalPopupIfPresent(page, siteName);
        await closeCookiePopupIfPresent(page, siteName);
    }
}

async function triggerLoadMore(
    page: Page,
    siteName: SiteName,
    config: SlotArchiveConfig,
    previousCount: number,
    attempt: number,
    customButton?: Locator,
    descriptorOverride?: string,
) {
    const selector = config.loadMoreSelector!;
    const loadMoreButton = customButton ?? page.locator(selector).first();
    const descriptor = descriptorOverride ?? `selector "${selector}"`;
    const isVisible = await loadMoreButton.isVisible().catch(() => false);
    const isEnabled = await loadMoreButton.isEnabled().catch(() => false);
    if (!isVisible || !isEnabled) {
        return false;
    }

    await loadMoreButton.scrollIntoViewIfNeeded().catch(() => undefined);
    logInfo(`[${siteName}] Triggering load-more (#${attempt}) via ${descriptor}.`);

    try {
        await loadMoreButton.click({ timeout: 8000, force: true });
    } catch (error) {
        logFailure(`[${siteName}] Load-more click failed (#${attempt}). ${formatError(error)}`);
        return false;
    }

    const increased = await waitForSlotCountIncrease(page, config.slotCardSelector, previousCount, 12000);
    if (!increased) {
        logFailure(`[${siteName}] Load-more click (#${attempt}) did not add new slot cards within timeout.`);
        return false;
    }
    logInfo(`[${siteName}] Load-more (#${attempt}) succeeded. Total slots now: ${increased}.`);
    return true;
}

type MultiLoadMoreTarget = {
    button: Locator;
    descriptor: string;
    termId?: string;
};

async function findNextLoadMoreButton(
    page: Page,
    config: SlotArchiveConfig,
    perButtonClicks: Record<string, number>,
): Promise<MultiLoadMoreTarget | null> {
    const selector = config.loadMoreSelector;
    if (!selector) return null;

    const perButtonLimit = config.loadMorePerButtonLimit ?? 10;
    const allowedIds = config.loadMoreAllowedDataIds;

    if (!allowedIds || allowedIds.length === 0) {
        const fallbackButton = page.locator(selector).first();
        if ((await fallbackButton.count()) === 0) {
            return null;
        }
        const descriptor = `selector "${selector}"`;
        const isVisible = await fallbackButton.isVisible().catch(() => false);
        const isEnabled = await fallbackButton.isEnabled().catch(() => false);
        if (!isVisible || !isEnabled) {
            return null;
        }
        return { button: fallbackButton, descriptor };
    }

    for (const termId of allowedIds) {
        const clicksSoFar = perButtonClicks[termId] ?? 0;
        if (clicksSoFar >= perButtonLimit) {
            continue;
        }

        const buttonLocator = page.locator(`${selector}[data-term-id="${termId}"]`).first();
        if ((await buttonLocator.count()) === 0) {
            continue;
        }

        const isVisible = await buttonLocator.isVisible().catch(() => false);
        const isEnabled = await buttonLocator.isEnabled().catch(() => false);
        if (!isVisible || !isEnabled) {
            continue;
        }

        const termUrl = (await buttonLocator.getAttribute('data-term-url')) ?? '';
        const descriptor = `term ${termId}${termUrl ? ` (${termUrl})` : ''}`;
        return { button: buttonLocator, descriptor, termId };
    }

    return null;
}

async function waitForSlotCountIncrease(
    page: Page,
    slotCardSelector: string,
    previousCount: number,
    timeoutMs: number,
) {
    const start = Date.now();
    let lastCount = previousCount;
    while (Date.now() - start < timeoutMs) {
        const currentCount = await page.locator(slotCardSelector).count();
        if (currentCount > previousCount) {
            return currentCount;
        }
        lastCount = currentCount;
        await page.waitForTimeout(250);
    }
    return false;
}

function ensureCsvInitialized(projectName: SiteName) {
    if (!fs.existsSync(BASE_REPORT_DIR)) {
        fs.mkdirSync(BASE_REPORT_DIR, { recursive: true });
    }
    const csvPath = getCsvFilePath(projectName);
    if (!fs.existsSync(csvPath)) {
        fs.writeFileSync(csvPath, CSV_HEADER, { encoding: 'utf8' });
        console.log(`[CSV] Initialized ${csvPath}`);
    }
}

function csvEscape(str: string | null | undefined) {
    if (str === null || str === undefined) return '""';
    return `"${String(str).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ')}"`;
}

function logFailureToCsv(projectName: SiteName, testStep: string, type: string, details: string, failingUrl: string) {
    ensureCsvInitialized(projectName);
    const row = `${csvEscape(projectName)},${csvEscape(testStep)},${csvEscape(type)},${csvEscape(details)},${csvEscape(
        failingUrl,
    )}`;
    fs.appendFileSync(getCsvFilePath(projectName), `${row}\n`, { encoding: 'utf8' });
}

test.describe('P1 Monthly • Slot Archive Smoke • Desktop', () => {
    test(`${TEST_ID}: Slot archive entries load without regressions`, async ({ page }, testInfo) => {
        const projectName = testInfo.project.name as SiteName | undefined;
        if (!projectName || !SUPPORTED_SLOT_ARCHIVE_PROJECTS.has(projectName)) {
            test.skip(true, `Slot archive smoke currently targets: ${Array.from(SUPPORTED_SLOT_ARCHIVE_PROJECTS).join(', ')}`);
            return;
        }

        const config = SLOT_ARCHIVE_CONFIGS[projectName];
        if (!config) {
            test.skip(true, `No slot archive config registered for ${projectName}`);
            return;
        }

        const baseURL = testInfo.project.use.baseURL;
        if (!baseURL) {
            throw new Error(`Project ${projectName} is missing a baseURL in Playwright config.`);
        }

        ensureCsvInitialized(projectName);
        const softFailures: string[] = [];

        const archiveUrl = new URL(config.archivePath, baseURL).toString();
        await navigateToArchivePage(page, archiveUrl, projectName);

        if (projectName === 'supercazino') {
            await processSupercazinoSloturiPopulare(page, projectName, baseURL, config, archiveUrl, softFailures);
            await processSupercazinoClasice(page, projectName, baseURL, config, archiveUrl, softFailures);
            await processSupercazinoFructe(page, projectName, baseURL, config, archiveUrl, softFailures);
            await processSupercazinoNoi(page, projectName, baseURL, config, archiveUrl, softFailures);
            await processSupercazinoPacanele7777(page, projectName, baseURL, config, archiveUrl, softFailures);
            await processSupercazinoSpeciale(page, projectName, baseURL, config, archiveUrl, softFailures);
            await processSupercazinoRuleta(page, projectName, baseURL, config, archiveUrl, softFailures);
        } else if (config.loadMoreSelector) {
            await processSlotsWithLoadMore(page, projectName, baseURL, config, archiveUrl, softFailures);
        } else {
            let paginationPage = 1;
            const paginationLimit = config.paginationLimit ?? 50;

            while (true) {
                const currentArchiveUrl = page.url();
                logInfo(`[${projectName}] ===== Processing slots page ${paginationPage} (${currentArchiveUrl}) =====`);
                await closeCookiePopupIfPresent(page, projectName);
                await closeOptionalPopupIfPresent(page, projectName);

                await processSlotsOnCurrentPage(
                    page,
                    projectName,
                    baseURL,
                    config,
                    paginationPage,
                    currentArchiveUrl,
                    softFailures,
                );

                if (paginationPage >= paginationLimit) {
                    logInfo(`[${projectName}] Reached pagination guard (${paginationLimit} pages). Stopping iteration.`);
                    break;
                }

                const movedToNextPage = await goToNextPaginationPage(page, projectName, config);
                if (!movedToNextPage) {
                    logInfo(`[${projectName}] No further pagination links detected. Ending run.`);
                    break;
                }

                paginationPage += 1;
            }
        }

        if (softFailures.length > 0) {
            const summary = `Detected ${softFailures.length} slot archive failure(s). See CSV for details.`;
            logFailure(summary);
            softFailures.forEach((entry) => logFailure(`↳ ${entry}`));
            throw new Error(summary);
        }
    });
});

async function navigateToArchivePage(page: Page, targetUrl: string, siteName: SiteName) {
    logInfo(`[${siteName}] Navigating to archive page: ${targetUrl}`);
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) {
        logFailure(`[${siteName}] Failed to load archive page (${status}) at ${targetUrl}`);
        throw new Error(`[${siteName}] Unable to load archive page. HTTP ${status}`);
    }
    await closeCookiePopupIfPresent(page, siteName);
    await closeOptionalPopupIfPresent(page, siteName);
}

async function processSlotsOnCurrentPage(
    page: Page,
    siteName: SiteName,
    baseURL: string,
    config: SlotArchiveConfig,
    pageNumber: number,
    archiveUrl: string,
    softFailures: string[],
) {
    const slotCards = page.locator(config.slotCardSelector);
    const slotCount = await slotCards.count();
    logInfo(`[${siteName}] Page ${pageNumber}: detected ${slotCount} slot card(s).`);

    if (slotCount === 0) {
        const detail = `No slots detected on archive page ${archiveUrl}`;
        logFailure(detail);
        logFailureToCsv(siteName, `${TEST_ID}.collect`, 'Missing Slots', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
        await testSlotCardByIndex(
            page,
            siteName,
            baseURL,
            config,
            pageNumber,
            archiveUrl,
            slotIndex,
            slotCount,
            softFailures,
        );
    }
}

async function processSupercazinoSloturiPopulare(
    page: Page,
    siteName: SiteName,
    baseURL: string,
    config: SlotArchiveConfig,
    archiveUrl: string,
    softFailures: string[],
) {
    const slotSection = page.locator('.card_slots').first();
    const sectionVisible = await slotSection.isVisible().catch(() => false);
    if (!sectionVisible) {
        const detail = 'Sloturi Populare section not found on archive page.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.section`, 'Missing Category Section', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    const slotCards = slotSection.locator('.card_inner.single-slot-in-card');
    const slotCount = await slotCards.count();

    if (slotCount === 0) {
        const detail = 'No slot cards detected in Sloturi Populare section.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.collect`, 'Missing Slots', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    logInfo(`[${siteName}] Sloturi Populare: detected ${slotCount} slot card(s).`);
    const slotMeta = await collectSupercazinoSlotMeta(slotCards);
    await validateSupercazinoSlotMetaList(
        slotMeta,
        'Sloturi Populare',
        slotCount,
        page,
        siteName,
        baseURL,
        config,
        archiveUrl,
        softFailures,
    );
}

async function processSupercazinoClasice(
    page: Page,
    siteName: SiteName,
    baseURL: string,
    config: SlotArchiveConfig,
    archiveUrl: string,
    softFailures: string[],
) {
    const section = page.locator('.term-container').filter({ has: page.locator('h2:has-text("Clasice")') }).first();
    const sectionVisible = await section.isVisible().catch(() => false);
    if (!sectionVisible) {
        const detail = 'Clasice section not found on archive page.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.section`, 'Missing Category Section', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    const slotCards = section.locator('.card_inner.single-slot-in-card');
    await expandSupercazinoSectionWithLoadMore(
        section,
        slotCards,
        '14',
        15,
        page,
        siteName,
        archiveUrl,
        softFailures,
    );

    const slotCount = await slotCards.count();
    if (slotCount === 0) {
        const detail = 'No slot cards detected in Clasice section.';
        logFailure(`[${siteName}] ${detail}`);
        logFailureToCsv(siteName, `${TEST_ID}.collect`, 'Missing Slots', detail, archiveUrl);
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    logInfo(`[${siteName}] Clasice: detected ${slotCount} slot card(s).`);
    const slotMeta = await collectSupercazinoSlotMeta(slotCards);
    await validateSupercazinoSlotMetaList(
        slotMeta,
        'Clasice',
        slotCount,
        page,
        siteName,
        baseURL,
        config,
        archiveUrl,
        softFailures,
    );
}

type SupercazinoSlotMeta = { index: number; name: string; href: string };

async function collectSupercazinoSlotMeta(slotCards: Locator): Promise<SupercazinoSlotMeta[]> {
    return slotCards.evaluateAll((elements) =>
        elements.map((el, index) => {
            const titleAnchor = el.querySelector('.sc-h4-slot-card');
            const ctaAnchor = el.querySelector('a.btn.btn--1');
            const href =
                (titleAnchor?.getAttribute('href') || ctaAnchor?.getAttribute('href') || '').trim();
            const name = (titleAnchor?.textContent || ctaAnchor?.textContent || `Slot ${index + 1}`).trim();
            return { index, name, href };
        }),
    );
}

async function validateSupercazinoSlotMetaList(
    slotMeta: SupercazinoSlotMeta[],
    contextLabel: string,
    totalSlots: number,
    page: Page,
    siteName: SiteName,
    baseURL: string,
    config: SlotArchiveConfig,
    archiveUrl: string,
    softFailures: string[],
) {
    for (const meta of slotMeta) {
        const slotNumber = meta.index + 1;
        if (!meta.href) {
            const detail = `Slot card #${slotNumber} in ${contextLabel} has no href.`;
            logFailure(detail);
            logFailureToCsv(siteName, `${TEST_ID}.href`, 'Missing href on slot card', detail, archiveUrl);
            softFailures.push(`[${siteName}] ${detail}`);
            continue;
        }

        const slotName = meta.name || `Slot ${slotNumber}`;
        const absoluteSlotUrl = buildAbsoluteUrl(baseURL, meta.href);
        const stepLabel = `${contextLabel} • Slot ${slotNumber}/${totalSlots} • ${slotName}`;
        logInfo(`[${siteName}] ${stepLabel} — validating ${absoluteSlotUrl}`);

        await validateSlotInIsolatedPage(
            page,
            siteName,
            config,
            slotName,
            absoluteSlotUrl,
            stepLabel,
            softFailures,
        );
    }
}

async function expandSupercazinoSectionWithLoadMore(
    section: Locator,
    slotCards: Locator,
    termId: string,
    maxClicks: number,
    page: Page,
    siteName: SiteName,
    archiveUrl: string,
    softFailures: string[],
) {
    let clicks = 0;
    while (clicks < maxClicks) {
        const loadMoreButton = section.locator(`.load-more-btn[data-term-id="${termId}"]`).first();
        const isVisible = await loadMoreButton.isVisible().catch(() => false);
        const isEnabled = await loadMoreButton.isEnabled().catch(() => false);
        if (!isVisible || !isEnabled) {
            break;
        }

        const previousCount = await slotCards.count();
        try {
            await loadMoreButton.scrollIntoViewIfNeeded().catch(() => undefined);
            await loadMoreButton.click({ timeout: 8000, force: true });
        } catch (error) {
            const detail = `Load-more click failed for term ${termId}. ${formatError(error)}`;
            logFailure(`[${siteName}] ${detail}`);
            logFailureToCsv(siteName, `${TEST_ID}.loadmore`, 'Load-more Failure', detail, archiveUrl);
            softFailures.push(`[${siteName}] ${detail}`);
            break;
        }

        const increased = await waitForSlotCountIncrease(page, '.card_inner.single-slot-in-card', previousCount, 12000);
        if (!increased) {
            logInfo(`[${siteName}] Load-more for term ${termId} did not add slots within timeout.`);
            break;
        }

        clicks += 1;
        await closeOptionalPopupIfPresent(page, siteName);
        await closeCookiePopupIfPresent(page, siteName);
    }
}
type SlotTestOptions = {
    slotCardsLocator?: Locator;
    contextLabel?: string;
};

async function testSlotCardByIndex(
    page: Page,
    siteName: SiteName,
    baseURL: string,
    config: SlotArchiveConfig,
    pageNumber: number,
    archiveUrl: string,
    slotIndex: number,
    totalSlots: number,
    softFailures: string[],
    options: SlotTestOptions = {},
) {
    const { slotCardsLocator, contextLabel } = options;
    const slotCards = slotCardsLocator ?? page.locator(config.slotCardSelector);
    const card = slotCards.nth(slotIndex);
    await card.scrollIntoViewIfNeeded().catch(() => undefined);
    await expect(card, `Slot card #${slotIndex + 1} should be visible`).toBeVisible({ timeout: 15000 });

    const slotLinkLocator = config.slotLinkSelector ? card.locator(config.slotLinkSelector).first() : card.locator('a').first();
    if (config.slotLinkRequiresHover) {
        const hoverTarget = config.slotHoverSelector ? card.locator(config.slotHoverSelector).first() : card;
        await hoverTarget.hover({ timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(200);
    }
    const slotHref = (await slotLinkLocator.getAttribute('href'))?.trim();

    if (!slotHref) {
        const detail = `Slot card #${slotIndex + 1} on page ${pageNumber} has no href.`;
        logFailure(detail);
        logFailureToCsv(siteName, `${TEST_ID}.href`, 'Missing href on slot card', detail, page.url());
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    const slotName = await deriveSlotName(card, slotLinkLocator, slotHref, config);
    const absoluteSlotUrl = buildAbsoluteUrl(baseURL, slotHref);

    const pageLabel = contextLabel ?? `Page ${pageNumber}`;
    const stepLabel = `${pageLabel} • Slot ${slotIndex + 1}/${totalSlots} • ${slotName}`;
    logInfo(`[${siteName}] ${stepLabel} — opening ${absoluteSlotUrl}`);

    const useIsolatedPage = Boolean(config.loadMoreSelector || config.forceIsolatedValidation);
    if (useIsolatedPage) {
        await validateSlotInIsolatedPage(
            page,
            siteName,
            config,
            slotName,
            absoluteSlotUrl,
            stepLabel,
            softFailures,
        );
        return;
    }

    let navigationResponse: Response | null = null;
    let navigationSucceeded = false;

    const canClick = (await slotLinkLocator.isVisible().catch(() => false)) &&
        (await slotLinkLocator.isEnabled().catch(() => false));

    if (canClick) {
        try {
            navigationResponse = await clickThroughSlot(card, slotLinkLocator, page);
            navigationSucceeded = true;
        } catch (error) {
            logInfo(
                `[${siteName}] Click navigation failed for ${slotName}. Falling back to direct navigation. ${formatError(error)}`,
            );
        }
    }

    if (!navigationSucceeded) {
        try {
            navigationResponse = await page.goto(absoluteSlotUrl, { waitUntil: 'load', timeout: 45000 });
            navigationSucceeded = true;
        } catch (gotoError) {
            const message = `Unable to navigate to slot ${slotName} (${absoluteSlotUrl}). ${formatError(gotoError)}`;
            logFailure(message);
            logFailureToCsv(siteName, `${TEST_ID}.nav`, 'Navigation Failure', message, absoluteSlotUrl);
            softFailures.push(`[${siteName}] ${message}`);
            // await returnToArchive(page, archiveUrl, siteName, config);
            return;
        }
    }

    if (!navigationSucceeded) {
        const message = `Unknown navigation failure for slot ${slotName} (${absoluteSlotUrl}).`;
        logFailure(message);
        logFailureToCsv(siteName, `${TEST_ID}.nav`, 'Navigation Failure', message, absoluteSlotUrl);
        softFailures.push(`[${siteName}] ${message}`);
        await returnToArchive(page, archiveUrl, siteName);
        return;
    }

    const landingUrl = page.url();
    const status = navigationResponse?.status() ?? 0;
    if (status < 200 || status >= 400) {
        const detail = `Slot page returned HTTP ${status} (expected 2xx/3xx).`;
        logFailure(`[${siteName}] ${detail} Slot: ${slotName} URL: ${landingUrl}`);
        logFailureToCsv(siteName, `${TEST_ID}.status`, 'Slot page HTTP error', detail, landingUrl);
        softFailures.push(`[${siteName}] ${detail} (${landingUrl})`);
    }

    const h1Selector = config.h1Selector ?? 'h1';
    const h1Locator = page.locator(h1Selector).first();
    let h1Matched = false;
    try {
        await expect(h1Locator, 'Slot detail page should render an H1').toBeVisible({ timeout: 15000 });
        const h1Text = (await h1Locator.innerText()).trim();
        if (checkH1Content(slotName, h1Text)) {
            h1Matched = true;
            logSuccess(`[${siteName}] ${PASS_MARK} ${stepLabel} • H1 matched: "${h1Text}"`);
        } else {
            const detail = `H1 mismatch. Expected slot name tokens from "${slotName}" but got "${h1Text}".`;
            logFailure(detail);
            logFailureToCsv(siteName, `${TEST_ID}.h1`, 'Slot H1 mismatch', detail, landingUrl);
            softFailures.push(`[${siteName}] ${detail}`);
        }
    } catch (error) {
        const detail = `Missing H1 on slot detail page (${landingUrl}). ${formatError(error)}`;
        logFailure(detail);
        logFailureToCsv(siteName, `${TEST_ID}.h1.missing`, 'Missing H1', detail, landingUrl);
        softFailures.push(`[${siteName}] ${detail}`);
    }

    if (!h1Matched && status >= 200 && status < 400) {
        logInfo(`[${siteName}] Slot ${slotName} loaded but H1 validation failed.`);
    }

    await returnToArchive(page, archiveUrl, siteName);
}

async function validateSlotInIsolatedPage(
    archivePage: Page,
    siteName: SiteName,
    config: SlotArchiveConfig,
    slotName: string,
    absoluteSlotUrl: string,
    stepLabel: string,
    softFailures: string[],
) {
    const detailPage = await archivePage.context().newPage();
    let response: Response | null = null;
    try {
        response = await detailPage.goto(absoluteSlotUrl, { waitUntil: 'load', timeout: 45000 });
    } catch (error) {
        const message = `Unable to navigate to slot ${slotName} (${absoluteSlotUrl}) in isolated page. ${formatError(error)}`;
        logFailure(message);
        logFailureToCsv(siteName, `${TEST_ID}.nav`, 'Navigation Failure', message, absoluteSlotUrl);
        softFailures.push(`[${siteName}] ${message}`);
        await detailPage.close().catch(() => undefined);
        return;
    }

    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) {
        const detail = `Slot page returned HTTP ${status} (expected 2xx/3xx).`;
        logFailure(`[${siteName}] ${detail} Slot: ${slotName} URL: ${absoluteSlotUrl}`);
        logFailureToCsv(siteName, `${TEST_ID}.status`, 'Slot page HTTP error', detail, absoluteSlotUrl);
        softFailures.push(`[${siteName}] ${detail} (${absoluteSlotUrl})`);
        await detailPage.close().catch(() => undefined);
        return;
    }

    const h1Selector = config.h1Selector ?? 'h1';
    const h1Locator = detailPage.locator(h1Selector).first();
    try {
        await expect(h1Locator, 'Slot detail page should render an H1').toBeVisible({ timeout: 15000 });
        const h1Text = (await h1Locator.innerText()).trim();
        if (checkH1Content(slotName, h1Text)) {
            logSuccess(`[${siteName}] ${PASS_MARK} ${stepLabel} • H1 matched: "${h1Text}"`);
        } else {
            const detail = `H1 mismatch. Expected slot name tokens from "${slotName}" but got "${h1Text}".`;
            logFailure(detail);
            logFailureToCsv(siteName, `${TEST_ID}.h1`, 'Slot H1 mismatch', detail, absoluteSlotUrl);
            softFailures.push(`[${siteName}] ${detail}`);
        }
    } catch (error) {
        const detail = `Missing H1 on slot detail page (${absoluteSlotUrl}). ${formatError(error)}`;
        logFailure(detail);
        logFailureToCsv(siteName, `${TEST_ID}.h1.missing`, 'Missing H1', detail, absoluteSlotUrl);
        softFailures.push(`[${siteName}] ${detail}`);
    } finally {
        await detailPage.close().catch(() => undefined);
    }
}

async function clickThroughSlot(card: Locator, slotLinkLocator: Locator, page: Page) {
    const navigationPromise = page.waitForNavigation({ waitUntil: 'load', timeout: 45000 });
    await slotLinkLocator.click({ timeout: 15000 });
    return navigationPromise;
}

async function returnToArchive(page: Page, archiveUrl: string, siteName: SiteName) {
    if (page.url() === archiveUrl) {
        return;
    }
    logInfo(`[${siteName}] Returning to archive page: ${archiveUrl}`);
    await page.goto(archiveUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await closeCookiePopupIfPresent(page, siteName);
    await closeOptionalPopupIfPresent(page, siteName);
}

async function goToNextPaginationPage(page: Page, siteName: SiteName, config: SlotArchiveConfig) {
    const selector = config.paginationNextSelector ?? 'a.next.page-numbers';

    // Ensure pagination region is hydrated (many themes lazy-render it near footer)
    await page.evaluate(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
    await page.waitForTimeout(600);

    const nextButtons = page.locator(selector);
    const buttonCount = await nextButtons.count();
    if (buttonCount === 0) {
        logInfo(`[${siteName}] Pagination selector "${selector}" not found on ${page.url()}`);
        return false;
    }

    const nextButton = nextButtons.first();
    const hasHref = (await nextButton.getAttribute('href'))?.trim();
    if (!hasHref) {
        logFailure(`[${siteName}] Pagination next button exists but lacks an href attribute.`);
        return false;
    }

    const prevUrl = page.url();
    logInfo(`[${siteName}] Moving to next pagination page from ${prevUrl}`);
    try {
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }),
            nextButton.click({ timeout: 8000, force: true }),
        ]);
    } catch (error) {
        logInfo(`[${siteName}] Pagination click failed (${formatError(error)}). Falling back to direct navigation: ${hasHref}`);
        await page.goto(hasHref, { waitUntil: 'domcontentloaded', timeout: 45000 });
    }

    await closeCookiePopupIfPresent(page, siteName);
    await closeOptionalPopupIfPresent(page, siteName);

    const newUrl = page.url();
    if (newUrl === prevUrl) {
        logFailure(`[${siteName}] Pagination navigation did not change the page URL (${newUrl}).`);
        return false;
    }

    logInfo(`[${siteName}] Arrived at pagination page: ${newUrl}`);
    return true;
}

async function deriveSlotName(card: Locator, link: Locator, href: string, config: SlotArchiveConfig) {
    const namedLocator = config.slotNameSelector ? card.locator(config.slotNameSelector).first() : null;
    const namedText = namedLocator ? (await namedLocator.innerText().catch(() => ''))?.trim() : '';

    const candidates = [
        namedText,
        await link.getAttribute('data-slot-name'),
        await link.getAttribute('aria-label'),
        await link.getAttribute('title'),
        await card.getAttribute('data-slot-name'),
        (await link.innerText())?.trim(),
        (await card.innerText())?.trim(),
    ].filter((value): value is string => Boolean(value && value.trim().length > 0));

        if (candidates.length > 0) {
        return normalizeWhitespace(htmlEntityDecode(candidates[0]));
    }

    const slug = extractSlugFromHref(href);
    return slug ? slug : 'slot';
}

function extractSlugFromHref(href: string) {
    try {
        const sanitized = href.startsWith('http') ? href : `https://placeholder${href.startsWith('/') ? '' : '/'}${href}`;
        const url = new URL(sanitized);
        const segments = url.pathname.split('/').filter(Boolean);
        const lastSegment = segments[segments.length - 1];
        if (!lastSegment) return '';
        return lastSegment
            .split(/[-_]/)
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .trim();
    } catch {
        return href;
    }
}

function normalizeWhitespace(value: string) {
    return value.replace(/(\r\n|\n|\r)/g, ' ').replace(/\s+/g, ' ').trim();
}

function htmlEntityDecode(value: string) {
    return value
        .replace(/&nbsp;/gi, ' ')
        .replace(/&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .trim();
}

function formatError(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function logInfo(message: string) {
    console.log(`${INFO_MARK} ${message}`);
}

function logSuccess(message: string) {
    console.log(`${PASS_MARK} ${message}`);
}

function logFailure(message: string) {
    console.error(`${FAIL_MARK} ${message}`);
}
