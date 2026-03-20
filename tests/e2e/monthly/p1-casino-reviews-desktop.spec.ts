import { expect, Locator, Page, test } from '@playwright/test';
import {
    casinoReviewSiteConfigs,
    CasinoReviewSiteConfig,
    CasinoReviewSiteName,
    CasinoNameStrategy,
} from '../config/sites-casino-reviews';
import {
    buildAbsoluteUrl,
    checkH1Content,
    closeCookiePopupIfPresent,
    closeOptionalPopupIfPresent,
    ensureCsvInitialized,
    logFailureToCsv,
} from '../helpers/mobileMenuUtils';
import '../helpers/inactivityWatchdog';

type ReviewLinkTarget = {
    casinoName: string;
    href: string;
    anchorText: string;
    cardIndex: number;
    linkIndex: number;
};

const SUPPORTED_REVIEW_PROJECTS = new Set<CasinoReviewSiteName>([
    'supercazino',
    'casino.com.ro',
    'beturi',
    'jocsloturi',
    'jocpacanele',
    'jocuricazinouri',
]);

const TEST_ID = 'CR1';
const INFO_MARK = '🔍';
const PASS_MARK = '✅';
const FAIL_MARK = '❌';

test.describe('P1 Monthly • Casino Review Cards • Desktop', () => {
    test(`${TEST_ID}: Offer card review links stay healthy and match casino H1`, async ({ page }, testInfo) => {
        const currentProject = testInfo.project.name as CasinoReviewSiteName | undefined;
        if (!currentProject || !SUPPORTED_REVIEW_PROJECTS.has(currentProject)) {
            test.skip(true, `Casino review desktop spec currently targets: ${Array.from(SUPPORTED_REVIEW_PROJECTS).join(', ')}`);
            return;
        }

        const siteConfig = casinoReviewSiteConfigs[currentProject];
        if (!siteConfig) {
            test.skip(true, `No casino review config registered for ${currentProject}`);
            return;
        }

        const baseURL = testInfo.project.use.baseURL;
        if (!baseURL) {
            throw new Error(`Project ${currentProject} is missing a baseURL in Playwright config.`);
        }

        ensureCsvInitialized(currentProject);
        const softFailures: string[] = [];

        await navigateToOfferPage(page, baseURL, currentProject, siteConfig);

        const reviewTargets = await collectReviewTargets(page, currentProject, siteConfig, softFailures);

        expect(reviewTargets.length, 'Should detect at least one review hyperlink').toBeGreaterThan(0);

        let stepIndex = 0;
        for (const target of reviewTargets) {
            stepIndex += 1;
            await test.step(`${TEST_ID}.${stepIndex} Validate review link: ${target.anchorText}`, async () => {
                logInfo(
                    `[${target.casinoName}] Checking review link ${target.linkIndex + 1} from card ${target.cardIndex + 1} ` +
                        `(current page: ${page.url()})`,
                );
                await validateReviewTarget(page, baseURL, currentProject, target, siteConfig, softFailures);
            });
        }

        if (softFailures.length > 0) {
            const summary = `Detected ${softFailures.length} casino review failure(s). See failures CSV for details.`;
            logFailure(summary);
            softFailures.forEach((entry) => logFailure(`↳ ${entry}`));
            throw new Error(summary);
        }
    });
});

async function navigateToOfferPage(
    page: Page,
    baseURL: string,
    siteName: CasinoReviewSiteName,
    config: CasinoReviewSiteConfig,
) {
    const targetUrl = new URL(config.pagePath, baseURL).toString();
    logInfo(`Navigating to ${targetUrl} for ${siteName}`);
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    if (status < 200 || status >= 400) {
        logFailureToCsv(siteName, `${TEST_ID}.0`, 'Initial navigation failed', `Status: ${status}`, targetUrl);
        logFailure(`[${siteName}] Unable to load offer page ${targetUrl}. HTTP ${status}`);
        throw new Error(`[${siteName}] Failed to load offer page (${targetUrl}). HTTP ${status}`);
    }

    await closeCookiePopupIfPresent(page, siteName);
    await closeOptionalPopupIfPresent(page, siteName);

    const offerCards = page.locator(config.offerCardSelector);
    await expect(offerCards.first(), 'At least one offer card should be visible').toBeVisible({ timeout: 15000 });
}

async function collectReviewTargets(
    page: Page,
    siteName: CasinoReviewSiteName,
    config: CasinoReviewSiteConfig,
    softFailures: string[],
): Promise<ReviewLinkTarget[]> {
    const offerCards = page.locator(config.offerCardSelector);
    const cardCount = await offerCards.count();
    const targets: ReviewLinkTarget[] = [];

    for (let cardIndex = 0; cardIndex < cardCount; cardIndex++) {
        const card = offerCards.nth(cardIndex);
        const casinoName = await extractCasinoName(card, config.casinoNameStrategy);
        const reviewLinks = card.locator(config.reviewLinkSelector);
        const linkCount = await reviewLinks.count();

        for (let linkIndex = 0; linkIndex < linkCount; linkIndex++) {
            const link = reviewLinks.nth(linkIndex);
            const href = (await link.getAttribute('href'))?.trim();
            const anchorText = (await link.innerText()).trim();

            if (!href) {
                logFailureToCsv(
                    siteName,
                    `${TEST_ID}.collect`,
                    'Missing href on review link',
                    `Card ${cardIndex + 1} link ${linkIndex + 1}`,
                    page.url(),
                );
                logFailure(
                    `[${siteName}] Missing href for review link (card ${cardIndex + 1}, link ${linkIndex + 1}) on ${page.url()}`,
                );
                softFailures.push(
                    `[${siteName}] Missing href for review link (card ${cardIndex + 1}, link ${linkIndex + 1}) on ${page.url()}`,
                );
                continue;
            }

            targets.push({
                casinoName,
                href,
                anchorText,
                cardIndex,
                linkIndex,
            });
        }
    }

    return targets;
}

async function extractCasinoName(card: Locator, strategy: CasinoNameStrategy): Promise<string> {
    if (strategy.type === 'attribute') {
        const source = card.locator(strategy.selector).first();
        const attributeValue = await source.getAttribute(strategy.attribute);
        if (attributeValue?.trim()) {
            return attributeValue.trim();
        }
    } else {
        const source = card.locator(strategy.selector).first();
        let text = (await source.innerText()).trim();
        if (strategy.removePrefixes) {
            for (const prefix of strategy.removePrefixes) {
                if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
                    text = text.slice(prefix.length).trim();
                    break;
                }
            }
        }
        if (strategy.removeSuffixes) {
            for (const suffix of strategy.removeSuffixes) {
                if (text.toLowerCase().endsWith(suffix.toLowerCase())) {
                    text = text.slice(0, -suffix.length).trim();
                    break;
                }
            }
        }
        if (text) {
            return text;
        }
    }

    return 'unknown-casino';
}

async function validateReviewTarget(
    parentPage: Page,
    baseURL: string,
    siteName: CasinoReviewSiteName,
    target: ReviewLinkTarget,
    config: CasinoReviewSiteConfig,
    softFailures: string[],
) {
    const reviewUrl = buildAbsoluteUrl(baseURL, target.href);
    const reviewPage = await parentPage.context().newPage();
    try {
        const response = await reviewPage.goto(reviewUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const status = response?.status() ?? 0;

        if (status < 200 || status >= 400) {
            logFailureToCsv(
                siteName,
                `${TEST_ID}.status`,
                `Review link returned HTTP ${status}`,
                `Card ${target.cardIndex + 1} link ${target.linkIndex + 1}`,
                reviewUrl,
            );
            const message = `[${siteName}] Review link failed (${status}) for ${reviewUrl}`;
            logFailure(message);
            softFailures.push(message);
            return;
        }

        const h1Selector = config.h1Selector ?? 'h1';
        const h1Locator = reviewPage.locator(h1Selector).first();
        try {
            await expect(h1Locator, 'Review page should expose an H1').toBeVisible({ timeout: 15000 });
        } catch (error) {
            const message = `[${siteName}] H1 not found for ${target.casinoName} at ${reviewUrl}`;
            logFailureToCsv(
                siteName,
                `${TEST_ID}.h1.missing`,
                'H1 selector not visible',
                `Card ${target.cardIndex + 1} link ${target.linkIndex + 1}`,
                reviewUrl,
            );
            logFailure(`${message}. ${(error as Error)?.message ?? error}`);
            softFailures.push(message);
            return;
        }
        const h1Text = (await h1Locator.innerText()).trim();

        const matchesCasino = checkH1Content(target.casinoName, h1Text);
        if (!matchesCasino) {
            logFailureToCsv(
                siteName,
                `${TEST_ID}.h1`,
                `H1 mismatch for casino "${target.casinoName}"`,
                `H1: ${h1Text}`,
                reviewUrl,
            );
            const message = `[${siteName}] H1 mismatch for ${target.casinoName}. H1="${h1Text}" URL=${reviewUrl}`;
            logFailure(message);
            softFailures.push(message);
            return;
        }

        logSuccess(`[${target.casinoName}] ${reviewUrl} OK (H1 matched: "${h1Text}")`);
    } catch (error) {
        const message = `[${siteName}] Unexpected error while validating ${reviewUrl}: ${(error as Error)?.message ?? error}`;
        logFailureToCsv(
            siteName,
            `${TEST_ID}.unexpected`,
            `Unexpected error validating ${target.casinoName}`,
            `Card ${target.cardIndex + 1} link ${target.linkIndex + 1}`,
            reviewUrl,
        );
        logFailure(message);
        softFailures.push(message);
    } finally {
        await reviewPage.close().catch(() => null);
    }
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
