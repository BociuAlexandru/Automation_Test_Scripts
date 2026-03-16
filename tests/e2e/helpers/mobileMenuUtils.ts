import { Page } from '@playwright/test';
import * as fs from 'fs';
import path from 'path';
import { SiteName } from '../config/sites';

export const BASE_REPORT_DIR = path.join(process.cwd(), 'failures');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
export const CSV_HEADER = 'Project,Test ID,Failure Type,Details,Failing URL\n';

export function getCsvFailureFile(projectName: string) {
    return path.join(BASE_REPORT_DIR, `${projectName}_p0-homepage-smoke-mobile_${RUN_TIMESTAMP}.csv`);
}

export function ensureCsvInitialized(projectName: string) {
    if (!fs.existsSync(BASE_REPORT_DIR)) {
        fs.mkdirSync(BASE_REPORT_DIR, { recursive: true });
    }
    const csvPath = getCsvFailureFile(projectName);
    if (!fs.existsSync(csvPath)) {
        fs.writeFileSync(csvPath, CSV_HEADER, { encoding: 'utf8' });
        console.log(`[CSV] Initialized ${csvPath}`);
    }
    return csvPath;
}

const COOKIE_DISMISS_SELECTORS: Partial<Record<SiteName, string[]>> = {
    beturi: ['#CybotCookiebotDialogBodyButtonDecline'],
    'casino.com.ro': ['#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll'],
    jocsloturi: ['#CybotCookiebotDialogBodyButtonDecline'],
    jocpacanele: ['#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll'],
    jocuricazinouri: ['#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll'],
    supercazino: [
        '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
        '#CybotCookiebotDialogBodyButtonDecline',
    ],
};

const OPTIONAL_POPUP_SELECTORS: Partial<Record<SiteName, string[]>> = {
    'casino.com.ro': ['.wof-close.wof-close-icon[role="button"]', '.wof-close.wof-close-icon'],
    jocsloturi: ['.madrone-close', '.CloseButton__ButtonElement-sc-79mh24-0', '.popup-close', '.close-popup', '.new-popup-close'],
    jocpacanele: ['.wof-close.wof-close-icon[role="button"]', '.wof-close.wof-close-icon'],
    supercazino: [
        '#close-fixed-offer',
        '.CloseButton__ButtonElement-sc-79mh24-0',
        '.springfield-close',
    ],
};

export type MenuMapItem = {
    name: string;
    paths: string[];
    mainPath?: string;
};

export const SITE_TO_MENU_MAP: Record<SiteName, MenuMapItem[]> = {
    beturi: [],
    'casino.com.ro': [],
    jocpacanele: [],
    jocsloturi: [],
    supercazino: [],
    jocuricazinouri: [],
};

export type MobileMenuConfig = {
    burgerSelector?: string;
    menuRootSelector?: string;
    parentItemsSelector: string;
    parentLinkSelector?: string;
    useParentItemAsLink?: boolean;
    subMenuLinkSelector: string;
    subMenuLinkSelectorWithinContainer?: string;
    subToggleSelector?: string;
    forceDropdownParents?: boolean;
    subMenuPanelSelector?: string;
    parentDataAttribute?: string;
    panelDataAttribute?: string;
    backButtonSelector?: string;
};

export const MOBILE_MENU_CONFIG: Partial<Record<SiteName, MobileMenuConfig>> = {
    beturi: {
        burgerSelector: 'span.mobile-menu-trigger',
        menuRootSelector: 'div.mobile-menu-in',
        parentItemsSelector: 'div.mobile-menu-in ul#menu-main-menu-1 .simplebar-content > li.menu-item',
        parentLinkSelector: 'a',
        subMenuLinkSelector: 'ul.sub-menu a',
    },
    'casino.com.ro': {
        burgerSelector: 'div.menu_toggle a, .menu-toggle',
        menuRootSelector: '.mobile_menu',
        parentItemsSelector: '.mobile_menu_in .simplebar-content > ul > li.text-system-white',
        parentLinkSelector: '.subToggle',
        subMenuLinkSelector: '.sub_menu a',
        subMenuLinkSelectorWithinContainer: 'a',
        subToggleSelector: '.subToggle',
    },
    supercazino: {
        burgerSelector: '#mega-menu-drawer-icon',
        menuRootSelector: '#mega-menu-mobile-open-container',
        parentItemsSelector: '.mega-menu-mobile-level-1-items .mega-menu-mobile-item[data-scroll-col]',
        useParentItemAsLink: true,
        forceDropdownParents: true,
        subMenuLinkSelector: 'a[href]',
        subMenuLinkSelectorWithinContainer: 'a[href]',
        subMenuPanelSelector: '.mega-menu-list-mobile',
        parentDataAttribute: 'data-scroll-col',
        panelDataAttribute: 'data-scroll-for-col',
        backButtonSelector: '#mega-menu-back-arrow-container',
    },
    jocuricazinouri: {
        burgerSelector: '.jtTopMenuToggleMobile',
        menuRootSelector: '.jcTopMobileMenuCont',
        parentItemsSelector: '.jcTopMobileMenu > .jcTopChildCont',
        parentLinkSelector: '.jcTopWChild',
        subMenuLinkSelector: '.jcTopMobileChildren > a',
        subMenuLinkSelectorWithinContainer: 'a',
        subToggleSelector: '.jcTopSubToggle',
        forceDropdownParents: true,
    },
    jocpacanele: {
        burgerSelector: '.trigger-mobile-menu#hamburger-toggle',
        menuRootSelector: '#navbarNavDropdown.show',
        parentItemsSelector: '#navbarNavDropdown .navbar-nav > li.nav-item',
        parentLinkSelector: '.nav-link',
        subMenuLinkSelector: '.dropdown-menu a.dropdown-item',
        subMenuLinkSelectorWithinContainer: 'a.dropdown-item',
        subToggleSelector: '.dropdown-toggle',
        forceDropdownParents: true,
    },
    jocsloturi: {
        burgerSelector: '.ast-mobile-menu-buttons .menu-toggle.main-header-menu-toggle',
        menuRootSelector: '.main-header-bar-navigation',
        parentItemsSelector: '#primary-menu > li',
        parentLinkSelector: '> a',
        subMenuLinkSelector: 'ul.sub-menu a',
        subMenuLinkSelectorWithinContainer: 'a',
        subToggleSelector: '.ast-menu-toggle',
        forceDropdownParents: true,
    },
};

export function stripDiacritics(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function collapseToAlphaNumeric(text: string): string {
    return stripDiacritics(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

export function splitCamelCaseAndNumbers(text: string): string[] {
    let cleanedText = text.replace(/([a-z])([A-Z])/g, '$1 $2');
    cleanedText = cleanedText
        .replace(/([a-z])([0-9])/g, '$1 $2')
        .replace(/([0-9])([a-z])/g, '$1 $2');
    return cleanedText.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

const ROMANIAN_GRAMMAR_SUFFIXES = [
    'urilor',
    'iilor',
    'iile',
    'ului',
    'elor',
    'ilor',
    'urile',
    'lor',
    'lele',
    'ele',
    'ile',
    'rei',
    'ii',
    'ul',
    'le',
    'i',
    'e',
    'a',
];

function stripRomanianSuffix(token: string): string {
    for (const suffix of ROMANIAN_GRAMMAR_SUFFIXES) {
        if (
            token.endsWith(suffix) &&
            token.length - suffix.length >= 3 &&
            !(suffix.length === 1 && token.length < 5)
        ) {
            return token.slice(0, token.length - suffix.length);
        }
    }
    return token;
}

const COMMON_CASINO_SUFFIXES = ['bet', 'casino', 'cazino', 'slots', 'gaming', 'games', 'club', 'play'];

function removeCommonSuffix(token: string): string {
    for (const suffix of COMMON_CASINO_SUFFIXES) {
        if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
            return token.slice(0, token.length - suffix.length);
        }
    }
    return token;
}

export function checkH1Content(sourceText: string, h1Text: string): boolean {
    const normalizedH1 = stripDiacritics(h1Text).toLowerCase();
    const collapsedH1 = collapseToAlphaNumeric(h1Text);
    const sourceTokens = splitCamelCaseAndNumbers(sourceText)
        .map(token => stripDiacritics(token))
        .filter(token => token.length >= 2 && /[a-z0-9]/.test(token));

    if (sourceTokens.length === 0) {
        return true;
    }

    const buildVariants = (token: string): string[] => {
        const normalizedToken = token.toLowerCase();
        const collapsedToken = collapseToAlphaNumeric(token);
        const romanianTrimmed = stripRomanianSuffix(normalizedToken);
        const trimmedToken = removeCommonSuffix(romanianTrimmed);
        const collapsedTrimmed = collapseToAlphaNumeric(trimmedToken);
        const variants = new Set<string>();
        if (normalizedToken.length >= 2) variants.add(normalizedToken);
        if (collapsedToken.length >= 3) variants.add(collapsedToken);
        if (romanianTrimmed.length >= 2) variants.add(romanianTrimmed);
        if (trimmedToken.length >= 2) variants.add(trimmedToken);
        if (collapsedTrimmed.length >= 3) variants.add(collapsedTrimmed);
        return Array.from(variants);
    };

    const tokenMatches = sourceTokens.some(token => {
        return buildVariants(token).some(variant => {
            const collapsedVariant = collapseToAlphaNumeric(variant);
            return (
                (variant.length >= 2 && normalizedH1.includes(variant)) ||
                (collapsedVariant.length >= 3 &&
                    (collapsedH1.includes(collapsedVariant) || collapsedVariant.includes(collapsedH1)))
            );
        });
    });

    if (tokenMatches) {
        return true;
    }

    const collapsedSource = collapseToAlphaNumeric(sourceText);
    const romanianTrimmedSource = stripRomanianSuffix(sourceText.toLowerCase());
    const trimmedSource = removeCommonSuffix(romanianTrimmedSource);
    const collapsedTrimmedSource = collapseToAlphaNumeric(trimmedSource);

    if (collapsedSource.length >= 3 && collapsedH1.includes(collapsedSource)) {
        return true;
    }

    const collapsedRomanianTrimmed = collapseToAlphaNumeric(romanianTrimmedSource);
    if (collapsedRomanianTrimmed.length >= 3 && collapsedH1.includes(collapsedRomanianTrimmed)) {
        return true;
    }

    if (collapsedTrimmedSource.length >= 3 && collapsedH1.includes(collapsedTrimmedSource)) {
        return true;
    }

    return false;
}

export async function humanizePage(page: Page) {
    await page.evaluate(() => {
        const heights = [200, 500, 800];
        const randomHeight = heights[Math.floor(Math.random() * heights.length)];
        window.scrollBy(0, randomHeight);
    });
    await page.waitForTimeout(Math.random() * 500 + 500);
}

export function csvEscape(str: string | null | undefined): string {
    if (str === null || str === undefined) return '""';
    return `"${String(str).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ')}"`;
}

export function buildAbsoluteUrl(baseURL: string, href: string | null | undefined): string {
    if (!href) return '';
    if (/^https?:\/\//i.test(href)) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${baseURL.replace(/\/$/, '')}${href}`;
    return href;
}

export function logFailureToCsv(projectName: string, testId: string, type: string, details: string, url: string) {
    const csvRow = `${csvEscape(projectName)},${csvEscape(testId)},${csvEscape(type)},${csvEscape(details)},${csvEscape(url)}`;
    const csvPath = ensureCsvInitialized(projectName);
    fs.appendFileSync(csvPath, csvRow + '\n', { encoding: 'utf8' });
}

export async function closeCookiePopupIfPresent(page: Page, siteName: SiteName): Promise<boolean> {
    const selectors = COOKIE_DISMISS_SELECTORS[siteName];
    if (!selectors?.length) {
        return false;
    }

    for (const selector of selectors) {
        try {
            const dismissButton = page.locator(selector).first();
            if (await dismissButton.isVisible({ timeout: 1000 })) {
                await dismissButton.click({ timeout: 2000 });
                await page.waitForTimeout(150);
                console.log(`[${siteName}] INFO: Popup dismissed via selector "${selector}".`);
                return true;
            }
        } catch (error) {
            console.warn(`[${siteName}] WARN: Failed to auto-dismiss popup via selector "${selector}".`);
        }
    }

    return false;
}

export async function closeOptionalPopupIfPresent(page: Page, siteName: SiteName): Promise<boolean> {
    const selectors = OPTIONAL_POPUP_SELECTORS[siteName];
    if (!selectors?.length) {
        return false;
    }

    for (const selector of selectors) {
        try {
            const popupClose = page.locator(selector).first();
            if (await popupClose.isVisible({ timeout: 250 })) {
                await popupClose.click({ timeout: 2000 });
                await page.waitForTimeout(120);
                console.log(`[${siteName}] INFO: Optional popup dismissed via selector "${selector}".`);
                return true;
            }
        } catch {
            // Popup didn’t appear; ignore.
        }
    }

    return false;
}
