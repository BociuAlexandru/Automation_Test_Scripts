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
            '/', 
            '/bonus-casino/', 
            '/casino-online/', 
            '/bonus-fara-rulaj/', 
            '/jocuri/pacanele-gratis/', 
            '/t/500-rotiri-gratuite/', 
            '/t/200-rotiri-gratuite/', 
            '/bonus-de-bun-venit-casino/', 
            '/jocuri/sloturi-fructe/', 
            '/jocuri/sloturi-speciale/', 
            '/joc-slot/shining-crown-gratis/', 
            '/joc-slot/40-burning-hot-bell-link-demo/', 
            '/joc-slot/40-burning-hot/', 
            '/joc-slot/gates-of-olympus-gratis/', 
            '/joc-slot/sweet-bonanza-gratis/'            
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
            '/jocuri/pacanele-clasice/',
            '/jocuri-pacanele/',
            '/rotiri-gratuite/',
            '/',
            '/bonus-de-casino/',
            '/jocuri-cu-pacanele/shinning-crown-pacanele-online/',
            '/producatori-jocuri/egt-gratis/',
            '/jocuri/pacanele-fructe/',
            '/jocuri/ruleta-online/',
            '/jocuri-cu-pacanele/40-burning-hot-gratis/'
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
            '/cazinouri-online-bonus-fara-depunere/',
            '/casino-online-romania/',
            '/info-casino/',
            '/bonus-fara-rulaj/',
            '/cod-bonus-casino/',
            '/cazinouri-online-cu-bonus-fara-depunere/300-rotiri-gratuite/',
            '/',
            '/cele-mai-noi-cazinouri-online-romania/',
            '/oferte/bonus-aniversar-casino/',
            '/bonus-pariuri-fara-depunere/',
            '/jocuri-casino-gratis/'
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
            '/rotiri-gratuite/',
            '/bonus-fara-depunere-sloturi/',
            '/bonus-de-ziua-ta/',
            '/sloturi-casino-online/',
            '/sloturi-online-gratis/',
            '/',
            '/producator-jocuri/egt/',
            '/jocuri/sloturi-speciale/',
            '/blog/bonus-fara-rulaj/'
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
            '/bonus-fara-depunere/', 
            '/rotiri-gratuite/', 
            '/', 
            '/bonus-casino/', 
            '/jocuri/pacanele-gratis/', 
            '/bonus-fara-rulaj/', 
            '/bonus-de-bun-venit/', 
            '/bonus-de-ziua-ta/', 
            '/sloturi/', 
            '/jocuri/pacanele-cu-speciale/', 
            '/jocuri/pacanele-fructe/', 
            '/diverse/cazinouri-cu-mize-mici/', 
            '/producatori-sloturi/amusnet/', 
'/bonus-pariuri-fara-depunere/'
        ],
        affiliateUrlPattern: createAffiliatePattern('/offer/'), 
        skippedPaths: [],
        

    },

    // --- 6. BETURI.RO ---
    beturi: {
        startPaths: ['/'],
        ctaSelector: 'a.affiliate-meta-link[data-casino]',
        includePatterns: UNIVERSAL_CRAWL_PATTERNS,
        excludePatterns: [], 
        maxPages: 100,
        highTrafficPaths: [
            '/meciuri-azi/', 
            '/rotiri-gratuite-fara-depunere/', 
            '/bonus-fara-depunere-cazino/', 
            '/ponturi-pariuri/', 
            '/ponturi-pariuri/fotbal/', 
            '/', 
            '/free-bet/', 
            '/cota-2/', 
            '/top-casino-online/', 
            '/biletul-zilei/'
        ],
        affiliateUrlPattern: createAffiliatePattern('/aff/'), 
        skippedPaths: [],
        
    },
} as const;


  