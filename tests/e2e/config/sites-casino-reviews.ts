import { SiteName } from './sites';

export type CasinoReviewSiteName = Extract<SiteName, 'supercazino' | 'casino.com.ro' | 'beturi' | 'jocsloturi' | 'jocpacanele' | 'jocuricazinouri'>;

export type TextStrategy = {
    type: 'text';
    selector: string;
    removePrefixes?: string[];
    removeSuffixes?: string[];
};

export type AttributeStrategy = {
    type: 'attribute';
    selector: string;
    attribute: string;
};

export type CasinoNameStrategy = TextStrategy | AttributeStrategy;

export type CasinoReviewSiteConfig = {
    /** Relative path where the casino review offer cards live */
    pagePath: string;
    /** Selector for each offer card instance */
    offerCardSelector: string;
    /** Selector used inside each card to locate review hyperlinks */
    reviewLinkSelector: string;
    /** Strategy for extracting the casino name from a card */
    casinoNameStrategy: CasinoNameStrategy;
    /** Optional override for locating the page H1 (defaults to `h1`) */
    h1Selector?: string;
};

export const casinoReviewSiteConfigs: Record<CasinoReviewSiteName, CasinoReviewSiteConfig> = {
    supercazino: {
        pagePath: 'https://www.supercazino.ro/casino-online/',
        offerCardSelector: '.offer--collapse',
        reviewLinkSelector: 'a.casino-review',
        casinoNameStrategy: {
            type: 'attribute',
            selector: '.affiliate-meta-link[data-casino]',
            attribute: 'data-casino',
        },
        h1Selector: 'h1',
    },
    'casino.com.ro': {
        pagePath: '/',
        offerCardSelector: '.offer_1_in',
        reviewLinkSelector: 'a[href*="/cazinou/"]',
        casinoNameStrategy: {
            type: 'attribute',
            selector: '.affiliate-meta-link[data-casino]',
            attribute: 'data-casino',
        },
        h1Selector: 'h1',
    },
    beturi: {
        pagePath: 'https://beturi.ro/pariuri-online/',
        offerCardSelector: '.offer--1',
        reviewLinkSelector: 'a[href*="/recenzie/"]',
        casinoNameStrategy: {
            type: 'attribute',
            selector: '.affiliate-meta-link[data-casino]',
            attribute: 'data-casino',
        },
        h1Selector: 'h1',
    },
    jocsloturi: {
        pagePath: 'https://jocsloturi.ro/bonus-fara-depunere-sloturi/',
        offerCardSelector: '.casino-item.style_3',
        reviewLinkSelector: 'a.casino-review-link',
        casinoNameStrategy: {
            type: 'attribute',
            selector: '.affiliate-meta-link[data-casino]',
            attribute: 'data-casino',
        },
        h1Selector: 'h1',
    },
    jocpacanele: {
        pagePath: 'https://jocpacanele.ro/bonus-de-casino/',
        offerCardSelector: '.offer-card--3',
        reviewLinkSelector: 'a.btn-casino-review',
        casinoNameStrategy: {
            type: 'attribute',
            selector: '.affiliate-meta-link[data-casino]',
            attribute: 'data-casino',
        },
        h1Selector: 'h1',
    },
    jocuricazinouri: {
        pagePath: 'https://jocuricazinouri.com/casino-online-bonus-depunere/',
        offerCardSelector: '.offer--1',
        reviewLinkSelector: 'a.offer__recenzie',
        casinoNameStrategy: {
            type: 'text',
            selector: 'a.offer__recenzie',
            removePrefixes: ['Recenzie', 'Recenzia'],
            removeSuffixes: ['Casino', 'Cazino'],
        },
        h1Selector: 'h1',
    },
};
