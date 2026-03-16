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
};

const SUPPORTED_SLOT_ARCHIVE_PROJECTS = new Set<SiteName>([
    'casino.com.ro',
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
) {
    const slotCards = page.locator(config.slotCardSelector);
    const card = slotCards.nth(slotIndex);
    await card.scrollIntoViewIfNeeded().catch(() => undefined);
    await expect(card, `Slot card #${slotIndex + 1} should be visible`).toBeVisible({ timeout: 15000 });

    const slotLinkLocator = config.slotLinkSelector ? card.locator(config.slotLinkSelector).first() : card.locator('a').first();
    const slotHref = (await slotLinkLocator.getAttribute('href'))?.trim();

    if (!slotHref) {
        const detail = `Slot card #${slotIndex + 1} on page ${pageNumber} has no href.`;
        logFailure(detail);
        logFailureToCsv(siteName, `${TEST_ID}.href`, 'Missing href on slot card', detail, page.url());
        softFailures.push(`[${siteName}] ${detail}`);
        return;
    }

    const slotName = await deriveSlotName(card, slotLinkLocator, slotHref);
    const absoluteSlotUrl = buildAbsoluteUrl(baseURL, slotHref);

    const stepLabel = `Page ${pageNumber} • Slot ${slotIndex + 1}/${totalSlots} • ${slotName}`;
    logInfo(`[${siteName}] ${stepLabel} — opening ${absoluteSlotUrl}`);

    let navigationResponse: Response | null = null;
    let navigationSucceeded = false;

    try {
        navigationResponse = await clickThroughSlot(card, slotLinkLocator, page);
        navigationSucceeded = true;
    } catch (error) {
        logInfo(`[${siteName}] Click navigation failed for ${slotName}. Falling back to direct navigation. ${formatError(error)}`);
        try {
            navigationResponse = await page.goto(absoluteSlotUrl, { waitUntil: 'load', timeout: 45000 });
            navigationSucceeded = true;
        } catch (gotoError) {
            const message = `Unable to navigate to slot ${slotName} (${absoluteSlotUrl}). ${formatError(gotoError)}`;
            logFailure(message);
            logFailureToCsv(siteName, `${TEST_ID}.nav`, 'Navigation Failure', message, absoluteSlotUrl);
            softFailures.push(`[${siteName}] ${message}`);
            await returnToArchive(page, archiveUrl, siteName);
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

async function deriveSlotName(card: Locator, link: Locator, href: string) {
    const candidates = [
        await link.getAttribute('data-slot-name'),
        await link.getAttribute('aria-label'),
        await link.getAttribute('title'),
        await card.getAttribute('data-slot-name'),
        (await link.innerText())?.trim(),
        (await card.innerText())?.trim(),
    ].filter((value): value is string => Boolean(value && value.trim().length > 0));

    if (candidates.length > 0) {
        return normalizeWhitespace(candidates[0]);
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
