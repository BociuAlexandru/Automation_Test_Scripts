// tests/e2e/config/sites.ts

export type SiteName = 'supercazino' | 'jocpacanele' | 'jocuricazinouri' | 'jocsloturi' | 'casino.com.ro' | 'beturi';

export type SiteConfig = {
    /** Where the crawler starts on this site (relative paths) */
    startPaths: string[];
    /** CSS selector for affiliate CTAs */
    ctaSelector: string;
    /** Only crawl URLs whose pathname matches at least one include pattern */
    includePatterns: RegExp[];
    /** Never crawl URLs whose pathname matches any exclude pattern */
    excludePatterns: RegExp[];
    /** Safety cap: max number of unique pages to visit per site run (for crawling script) */
    maxPages: number;
    /** ➡️ List of pages for the high-traffic audit script */
    highTrafficPaths: string[]; 
    /** ➡️ NEW: Regex pattern that identifies any affiliate link on this domain */
    affiliateUrlPattern: RegExp;
    /** ➡️ FIX: Define skipped paths for unstable pages */
    skippedPaths?: string[]; 
};

// --- DEFINITIVE PATTERN CONSTANTS ---
const ALL_CASINOS = 'topbet|winbet|luck|12xBet|bonusbet|swipercasino|redsevens|magnumbet|mrplay|king|prowin|winner|32rosu|conti|lasvegas|mozzartbet|winboss|fortunapalace|ultrabet|maxwin|princess|vivabet|admiralbet|prima|totogaming|pokerstars|mrbit|betfair|player|pariuriplus|luckyseven|totalbet|one|manhattan|gameworld|favbet|million|frank|excelbet|superbet|getsbet|fortuna|eliteslots|publicwin|hotspins|don|betmen|cashpot|betano|bet7|888|vlad|lady|casapariurilor|powerbet|winmasters|spin|maxbet|netbet|seven|royalslots|stanleybet|playgg|win2|slotv|unibet|platinum|mozzart|victory|royal';
const SLUG_PATTERN = `(${ALL_CASINOS.replace(/ /g, '')})`; 
const URL_END = '(\\/?|\\?.*)$';
const RE_FLAGS = 'i'; 

// ➡️ UNIVERSAL CRAWL PATTERNS: FINAL MAXIMAL COVERAGE FOR SITEMAP LINKS
const UNIVERSAL_CRAWL_PATTERNS = [
    /^\/$/, // 1. Home page
    // 2. ULTIMATE CATCH-ALL: Matches any path starting with a slash, allowing letters, 
    // numbers, hyphens, underscores, slashes, AND CRITICALLY, THE PERIOD (.).
    /^\/[\w\d-./]+$/i, 
];

/**
 * Creates a simple, broad regex matching the base path plus ANYTHING.
 */
const createAffiliatePattern = (domainPath: string) => {
    // Escapes common regex characters and constructs the full path pattern
    const pathPattern = `${domainPath.replace(/\//g, '\\/')}.*`; // Matches path + ANY characters
    
    // Pattern matches: 1) Full URL with domain OR 2) Relative URL
    const fullPattern = new RegExp(
        `^(https?:\\/\\/)?([a-zA-Z0-9.-]+)?${pathPattern}${URL_END}`, 
        RE_FLAGS
    );
    return fullPattern;
};


export const siteConfigs: Record<SiteName, SiteConfig> = {
    // --- 1. SUPERCAZINO.RO ---
    supercazino: {
        startPaths: ['/'], 
        ctaSelector: 'a.affiliate-meta-link[data-casino]',
        includePatterns: UNIVERSAL_CRAWL_PATTERNS,
        excludePatterns: [], 
        maxPages: 100,
        highTrafficPaths: [
            '/', '/bonus-fara-depunere-2025/', '/rotiri-gratuite-fara-depunere-2025/',
            '/new-subscribers-email/', '/gads-lp-rotiri-gratuite-fara-depunere-pmax/',
            '/cazinouri-noi-licentiate/', '/gads-lp-bonus-cu-depunere-2025/',
            '/cazinouri-online-rotiri-gratuite/', '/bonus-casino/', '/m-oferte-fara-depunere-premium/',
            '/bonus-casino-sm/', '/g-oferte-fara-depunere-premium/', '/casino-online/',
            '/oferte-cu-depunere-premium-g/', '/top-cazinouri-2025-eml/',
            '/gads-lp-rotiri-gratuite-fara-depunere-ex/', '/m-oferte-cu-depunere-premium/',
            '/cazinouri-noi-licentiate-sm/', '/lp-multi-offer/', '/cele-mai-noi-cazinouri/',
            '/blog/reguli-kings/', '/bonus-fara-rulaj/',
        ],
        affiliateUrlPattern: createAffiliatePattern('/goaffcas/'), 
        skippedPaths: [], 
    },

    // --- 2. JOCPACANELE.RO ---
    jocpacanele: {
        startPaths: ['/'],
        ctaSelector: 'a.affiliate-meta-link[data-casino]',
        includePatterns: UNIVERSAL_CRAWL_PATTERNS,
        excludePatterns: [],
        maxPages: 100,
        highTrafficPaths: [
            '/', '/jocuri/pacanele-clasice/', '/jocuri-cu-pacanele/shinning-crown-pacanele-online/',
            '/jocuri-pacanele/', '/bonusuri-fara-depunere-pm/', '/jocuri-cu-pacanele/pacanele-7777-40-super-hot/',
            '/jocuri-cu-pacanele/pacanele-online-sizzling-hot-deluxe/', '/jocuri-cu-pacanele/burning-hot-pacanele-cu-fructe/',
            '/producatori-jocuri/egt-gratis/', '/bonus-de-casino/', '/jocuri-cu-pacanele/joc-pacanele-dice-roll/',
            '/jocuri-cu-pacanele/40-burning-hot-gratis/', '/rotiri-gratuite/', '/jocuri-cu-pacanele/20-dazzling-hot-gratis/',
            '/jocuri-cu-pacanele/pacanele-gratis-dazzling-hot/', '/jocuri-cu-pacanele/jocuri-cu-pacanele-20-super-hot/',
            '/jocuri-cu-pacanele/pacanele-cu-77777-fruit-cocktail/', '/jocuri-cu-pacanele/20-burning-hot-gratis/',
            '/jocuri-cu-pacanele/100-super-hot-gratis/', '/jocuri/pacanele-fructe/',
            '/jocuri-cu-pacanele/100-burning-hot-gratis/', '/bonus-fara-depunere-mr-play/',
            '/bonus-fara-depunere-swiper/', '/jocuri-cu-pacanele/40-super-hot-bell-link-gratis/',
            '/jocuri-cu-pacanele/pacanele-ca-la-aparate-lucky-lady-charm-deluxe/', '/jocuri-cu-pacanele/pacanele-ca-la-aparate-crazy-monkey/',
            '/jocuri-cu-pacanele/american-poker-2-gratis/', '/jocuri-cu-pacanele/extra-stars-gratis/',
            '/jocuri-cu-pacanele/supreme-hot-gratis/', '/bonus-fara-depunere-ultrabet/',
            '/swiper-bonus-de-bun-venit/', '/jocuri-cu-pacanele/5-dazzling-hot-bell-link-gratis/',
            '/jocuri/pacanele-coroane/', '/jocuri/ruleta-online/',
            '/jocuri-cu-pacanele/20-super-hot-bell-link-gratis/', '/jocuri-cu-pacanele/40-burning-hot-6-reels-gratis/',
            '/jocuri-cu-pacanele/versailles-gold-egt-gratis/', '/888-casino-bonus-fara-depunere/',
        ],
        affiliateUrlPattern: createAffiliatePattern('/goaffcas/'), 
        skippedPaths: [],
    },

    // --- 3. JOCURICAZINOURI.COM ---
    jocuricazinouri: {
        startPaths: ['/'],
        ctaSelector: 'a.affiliate-meta-link[data-casino-name]',
        includePatterns: UNIVERSAL_CRAWL_PATTERNS,
        excludePatterns: [],
        maxPages: 100,
        highTrafficPaths: [
            '/', '/cazinouri-online-cu-bonus-fara-depunere/', '/casino/betano/',
            '/casino/bet7/', '/casino/hot-spins/', '/casino/frank-casino/',
            '/casino-online-romania/',
        ],
        affiliateUrlPattern: createAffiliatePattern('/aff/so-'), 
        skippedPaths: [],
    },

    // --- 4. JOCSLOTURI.RO ---
    jocsloturi: {
        startPaths: ['/'], 
        ctaSelector: 'a.affiliate-meta-link[data-casino]',
        includePatterns: UNIVERSAL_CRAWL_PATTERNS,
        excludePatterns: [], 
        maxPages: 100,
        highTrafficPaths: [
            '/', '/bonus-fara-depunere-sloturi/', '/blog/cum-se-joaca-barbut/',
            '/sloturi-casino-online/', '/blog/depunere-minima-10-lei/', '/jocuri/sloturi-777/',
            '/info-casino/bonus-fara-depunere-magic-jackpot/', '/rotiri-gratuite/',
        ],
        affiliateUrlPattern: createAffiliatePattern('/aff/'), 
        skippedPaths: [],
    },

    // --- 5. CASINO.COM.RO ---
    'casino.com.ro': {
        startPaths: ['/'],
        ctaSelector: 'a.affiliate-meta-link[data-casino]',
        includePatterns: UNIVERSAL_CRAWL_PATTERNS,
        excludePatterns: [], 
        maxPages: 100,
        highTrafficPaths: [
            '/', '/jocuri/pacanele-gratis/', '/new-no-deposit/', '/bonusuri-fara-depunere-online-2025/',
            '/rotiri-fara-depunere-online-2025/', '/bonusuri-fara-depunere-pmax/', '/bonus-fara-depunere/',
            '/bonus-bun-venit-online-2025/', '/cazinouri-noi-licentiate/', '/sm-bonus-fara-depunere-casino-online/',
            '/m-oferte-cu-depunere-premium/', '/bonus-fara-rulaj/', '/g-oferte-fara-depunere-premium/',
            '/slot/shining-crown/', '/m-oferte-fara-depunere-premium/', '/cazinou/king-casino/',
            '/diverse/cazinouri-cu-mize-mici/', '/rotiri-gratuite/', '/ghid/bonus-elite-slots/',
            '/jocuri/pacanele-cu-speciale/', '/sloturi/', '/slot/sizzling-hot-deluxe/',
            '/bonus-de-bun-venit/', '/cazinou/prima-casino/', '/slot/40-shining-crown-bell-link-demo/',
            '/cazinou/12xbet/', '/bonus-casino-standard/rotiri-gratuite-million/',
        ],
        affiliateUrlPattern: createAffiliatePattern('/offer/'), 
        skippedPaths: [
            '/rotiri-gratuite/', 
            '/bonus-fara-depunere/',
        ],
    },

    // --- 6. BETURI.RO ---
    beturi: {
        startPaths: ['/'],
        ctaSelector: 'a.affiliate-meta-link[data-casino]',
        includePatterns: UNIVERSAL_CRAWL_PATTERNS,
        excludePatterns: [], 
        maxPages: 100,
        highTrafficPaths: [
            '/', '/ponturi-pariuri/', '/ponturi-pariuri/fotbal/', '/biletul-zilei/',
            '/cota-2/', '/meciuri-azi/', '/echipa-cfr-cluj/', '/case-pariuri-oferte/',
            '/bonus-fara-depunere-cazino/', '/case-pariuri-oferte/betano-bonus-fara-depunere/',
            '/rotiri-gratuite-fara-depunere/', '/pariuri-online/', '/oferte-cazino/88-rotiri-gratuite-888/',
            '/oferte-cazino/winner-bonus-fara-depunere/', '/free-bet/', '/ghid-casino/king-casino-contact/',
            '/ghid-casino/inregistrare-swiper/', '/oferte-cazino/500-rotiri-gratuite-netbet/',
            '/oferte-cazino/888-casino-bonus-fara-depunere/',
        ],
        affiliateUrlPattern: createAffiliatePattern('/aff/'), 
        skippedPaths: [],
    },
} as const;


  