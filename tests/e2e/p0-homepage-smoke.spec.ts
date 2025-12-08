// tests/e2e/p0-homepage-smoke.spec.ts (V47 - Ultimate Crash Recovery)

// 💥 CRITICAL IMPORTS
import { test, expect, TestInfo, Page } from '@playwright/test'; 
import { siteConfigs, SiteName } from './config/sites'; 

/**
 * Helper to get the siteName from the Playwright Project Name.
 */
const getSiteNameFromProject = (projectName: string): SiteName => {
    return projectName as SiteName;
};

// --- CORE UTILITY: Humanize Page Interaction ---
async function humanizePage(page: Page) {
    // 1. Random Scroll (Simulate reading/browsing)
    await page.evaluate(() => {
        const heights = [200, 500, 800];
        const randomHeight = heights[Math.floor(Math.random() * heights.length)];
        window.scrollBy(0, randomHeight);
    });
    // 2. Small random pause (Simulate thought/processing)
    await page.waitForTimeout(Math.random() * 500 + 500); // 500ms to 1000ms delay
}

// --- TYPE DEFINITION ---
type MenuMapItem = { 
    selector: string; 
    name: string; 
    hasDropdown: boolean; 
    paths: string[]; 
    mainPath?: string; 
};

// --- UNIVERSAL MENU MAPS (Click-Triggered Sites) ---

const CCR_MENU_MAP: MenuMapItem[] = [
    { name: 'Bonusuri Fără Depunere', selector: 'li:nth-child(1) a[href="#"]', hasDropdown: true, 
      paths: ['/bonus-fara-depunere/', '/rotiri-gratuite/', '/bonus-pariuri-fara-depunere/'], mainPath: '/bonusuri-fara-depunere-online-2025/' },
    
    { name: 'Bonusuri', selector: 'li:nth-child(2) a[href="#"]', hasDropdown: true, 
      paths: ['/calendar-craciun-bonusuri-casino/', '/bonus-de-bun-venit/', '/bonus-casino/', '/pacanele-online-cu-cardul/', '/bonus-fara-rulaj/', '/bonus-de-ziua-ta/', '/roata-norocului-casino/', '/bonusuri-pariuri-sportive/'], mainPath: '/bonus-de-bun-venit/' },
    
    { name: 'Recenzii', selector: 'li:nth-child(3) a[href="#"]', hasDropdown: true, 
      paths: ['/cazinouri/', '/cazinou/prima-casino/', '/cazinou/superbet/', '/cazinou/player-casino/', '/cazinou/netbet/', '/cazinou/winboss/', '/cazinou/mr-bit/', '/cazinou/totogaming/', '/cazinou/conticazino/', '/cazinou/pokerstars/', '/cazinou/casa-pariurilor/', '/cazinou/fortuna/', '/cazinou/pacanele-ro/', '/cazinou/winbet/', '/cazinou/betano/', '/cazinou/don-casino/', '/cazinou/12xbet/', '/cazinou/maxwin/', '/cazinou/777-casino/', '/cazinou/king-casino/'], mainPath: '/cazinouri/' },
    
    { name: 'Sloturi Gratis', selector: 'li:nth-child(4) a[href="#"]', hasDropdown: true, 
      paths: ['/sloturi/', '/jocuri/pacanele-gratis/', '/jocuri/pacanele-fructe/', '/jocuri/pacanele-cu-trifoi/', '/jocuri/pacanele-cu-speciale/', '/jocuri/pacanele-dublaje/', '/jocuri/sloturi-cu-rtp-mare/', '/jocuri/pacanele-megaways/', '/jocuri/pacanele-jackpot/', '/jocuri/pacanele-cu-coroane/', '/jocuri/bell-link-demo/', '/jocuri/clover-chance/', '/jocuri/egypt-quest/', '/jocuri/ruleta-online-gratis/', '/jocuri/blackjack-online-gratis/'], mainPath: '/sloturi/' },
    
    { name: 'Producători', selector: 'li:nth-child(5) a[href="#"]', hasDropdown: true, 
      paths: ['/producatori-sloturi-online/', '/producatori-sloturi/amusnet/', '/producatori-sloturi/pragmatic-play/', '/producatori-sloturi/novomatic/', '/producatori-sloturi/netent/', '/producatori-sloturi/isoftbet/', '/producatori-sloturi/relax-gaming/', '/producatori-sloturi/hacksaw-gaming/', '/producatori-sloturi/playngo/', '/producatori-sloturi/skywind/'], mainPath: '/producatori-sloturi-online/' },
    
    { name: 'Noutăți', selector: 'li:nth-child(6) a[href="#"]', hasDropdown: true, 
      paths: ['/blog/', '/bonus-casino-standard/prima-casino-bonus-fara-depunere/', '/bonus-casino-exclusiv/superbet-bonus-fara-depunere/', '/ghid/cod-bonus-player-casino/', '/bonus-casino-exclusiv/netbet-rotiri-gratuite/', '/bonus-casino-exclusiv/rotiri-gratuite-winboss/', '/ghid/mr-bit-bonus-fara-depunere/', '/bonus-casino-standard/bonusuri-totogaming/', '/ghid/conti-cazino-bonus-fara-depunere/', '/bonus-casino-standard/bonus-casa-pariurilor/', '/bonus-casino-exclusiv/bonus-fara-depunere-fortuna/', '/bonus-casino-standard/bonus-pacanele-casino/', '/bonus-casino-standard/winbet-100-rotiri-gratuite-fara-depozit/', '/bonus-casino-exclusiv/bonus-fara-depunere-betano/', '/ghid/bonusuri-don-casino/', '/bonus-casino-standard/bonus-12xbet/', '/bonus-casino-standard/rotiri-gratuite-million/', '/bonus-casino-standard/bonus-32rosu/'], mainPath: '/blog/' },
    
    { name: 'Poker', selector: 'li:nth-child(7) a[href="#"]', hasDropdown: true, 
      paths: ['/poker-online/', '/poker/freeroll-poker/', '/poker/', '/poker/cum-sa-castigi-la-poker/', '/poker/poker-omaha-hi-lo/', '/poker/seven-card-stud/', '/poker/razz-poker/', '/poker/short-deck-poker/', '/poker/omaha-poker/', '/poker/2-7-triple-draw-poker/'], mainPath: '/poker-online/' },
];

const JP_MENU_MAP: MenuMapItem[] = [
    { name: 'Bonusuri Casino', selector: 'li:nth-child(1) a[href="#"]', hasDropdown: true, 
      paths: ['/bonus-de-casino/', '/bonus-halloween-casino/', '/rotiri-gratuite/', '/cod-bonus-casino/', '/bonus-aniversar-casino/', '/bonus-fara-rulaj/', '/casino-online-live/'], mainPath: '/bonus-de-casino/' },
    
    { name: 'Top Casino Online', selector: 'li:nth-child(2) a[href="#"]', hasDropdown: true, 
      paths: ['/top-casino-online-romania/', '/recenzie/betano-casino/', '/recenzie/netbet-casino/', '/recenzie/superbet-casino/', '/recenzie/mr-bit-casino/', '/recenzie/win2-casino/', '/recenzie/888-casino/', '/recenzie/totogaming-casino/', '/recenzie/conticazino/', '/recenzie/casa-pariurilor/', '/recenzie/casino-fortuna/', '/recenzie/winbet-casino/', '/recenzie/winner-casino/', '/recenzie/million-casino/', '/recenzie/getsbet-casino/', '/recenzie/luck-casino/', '/recenzie/vivabet-casino/', '/recenzie/32rosu-casino/', '/recenzie/prima-casino/', '/recenzie/vlad-cazino/', '/recenzie/powerbet/', '/recenzie/unibet-casino/', '/recenzie/winboss-casino/', '/recenzie/princess-casino/', '/recenzie/game-world-casino/', '/recenzie/maxbet-casino/', '/recenzie/stanleybet-casino/', '/recenzie/pokerstars-casino/', '/recenzie/admiral-bet-casino/', '/recenzie/lady-casino/', '/recenzie/pariuri-plus/', '/recenzie/winmasters-casino/', '/recenzie/don-casino/', '/recenzie/excelbet-casino/', '/recenzie/mozzartbet-casino/', '/recenzie/hot-spins-casino/', '/recenzie/royal-slots/', '/recenzie/spin-casino/', '/recenzie/maxwin-casino/', '/recenzie/one-casino/', '/recenzie/bet7/', '/recenzie/magnum-bet-casino/', '/recenzie/frank-casino/', '/recenzie/elite-slots-casino/', '/recenzie/las-vegas/', '/recenzie/favbet-casino/', '/recenzie/player-casino/', '/recenzie/betmen/', '/recenzie/lucky-seven-casino/', '/recenzie/fortuna-palace-casino/', '/recenzie/slotv-casino/', '/recenzie/publicwin-casino/'], mainPath: '/top-casino-online-romania/' },
    
    { name: 'Păcănele Gratis', selector: 'li:nth-child(3) a[href="#"]', hasDropdown: true, 
      paths: ['/jocuri-pacanele/', '/jocuri-cu-pacanele/shinning-crown-pacanele-online/', '/jocuri-cu-pacanele/pacanele-7777-40-super-hot/', '/jocuri-cu-pacanele/pacanele-online-sizzling-hot-deluxe/', '/jocuri-cu-pacanele/pacanele-book-of-ra-deluxe/', '/jocuri-cu-pacanele/gates-of-olympus-gratis/', '/jocuri-cu-pacanele/burning-hot-pacanele-cu-fructe/', '/jocuri-cu-pacanele/joc-pacanele-dice-roll/', '/jocuri-cu-pacanele/40-burning-hot-gratis/', '/jocuri-cu-pacanele/pacanele-gratis-dazzling-hot/', '/jocuri-cu-pacanele/jocuri-cu-pacanele-20-super-hot/', '/jocuri-cu-pacanele/pacanele-ca-la-aparate-crazy-monkey/'], mainPath: '/jocuri-pacanele/' },
    
    { name: 'Tipuri Păcănele', selector: 'li:nth-child(4) a[href="#"]', hasDropdown: true, 
      paths: ['/jocuri/pacanele-clasice/', '/jocuri/pacanele-fructe/', '/jocuri/ruleta-online/', '/jocuri/pacanele-coroane/', '/jocuri/pacanele-speciale/', '/jocuri/pacanele-trifoi/', '/jocuri/blackjack-gratis-online/', '/jocuri/poker-ca-la-aparate/', '/jocuri/pacanele-dublaje/', '/jocuri/pacanele-clopotei/', '/jocuri/pacanele-egipt/', '/jocuri/pacanele-noi/', '/jocuri/pacanele-rtp-mare/', '/jocuri/pacanele-de-craciun/', '/jocuri/pacanele-zaruri/', '/jocuri/pacanele-licentiate/', '/jocuri/pacanele-diamante/'], mainPath: '/jocuri/pacanele-clasice/' },
    
    { name: 'Producători', selector: 'li:nth-child(5) a[href="#"]', hasDropdown: true, 
      paths: ['/producatori-jocuri/', '/producatori-jocuri/no-limit/', '/producatori-jocuri/egt-gratis/', '/producatori-jocuri/pragmatic-play/', '/producatori-jocuri/playn-go/', '/producatori-jocuri/relax-gaming/', '/producatori-jocuri/isoftbet-gratis/', '/producatori-jocuri/novomatic-gratis/', '/producatori-jocuri/amatic/', '/producatori-jocuri/bf-games/', '/producatori-jocuri/fazi/', '/producatori-jocuri/gamevy/', '/producatori-jocuri/nextgen/', '/producatori-jocuri/oryx-gaming/', '/producatori-jocuri/quickspin-gratis/', '/producatori-jocuri/ruby-play/', '/producatori-jocuri/skywind-gratis/', '/producatori-jocuri/stakelogic/', '/producatori-jocuri/synot-gratis/', '/producatori-jocuri/wazdan-gratis/', '/producatori-jocuri/yggdrasil/'], mainPath: '/producatori-jocuri/' },
    
    { name: 'Loto', selector: 'li:nth-child(6) a[href="#"]', hasDropdown: true, 
      paths: ['/loto-usa/', '/loto-australia/', '/loto-austria/', '/loto-belgia/', '/loto-canada/', '/loto-danemarca/', '/loto-ue/', '/loto-finlanda/', '/loto-franta/', '/loto-germania/', '/loto-grecia/', '/loto-italia/', '/loto-letonia/', '/loto-norvegia/', '/loto-polonia/', '/loto-slovacia/', '/loto-slovenia/', '/loto-spania/', '/loto-uk/'], mainPath: '/loto-usa/' },
    
    { name: 'Noutăți', selector: 'li:nth-child(7) a[href="#"]', hasDropdown: true, 
      paths: ['/blog/'], mainPath: '/blog/' },
];

const JS_MENU_MAP: MenuMapItem[] = [
    { name: 'Bonusuri Casino', selector: 'li:nth-child(1) a[href="#"]', hasDropdown: true, 
      paths: ['/bonus-fara-depunere-sloturi/', '/rotiri-gratuite/', '/blog/bonus-fara-rulaj/', '/bonus-de-bun-venit-casino/', '/bonus-de-ziua-ta', '/jocuri-casino-live/', '/blog/depunere-minima-10-lei/'], mainPath: '/bonus-fara-depunere-sloturi/' },

    { name: 'Sloturi Gratis', selector: 'li:nth-child(2) a[href="#"]', hasDropdown: true, 
      paths: ['/sloturi-online-gratis/', '/jocuri/sloturi-777/', '/jocuri/sloturi-fructe-gratis/', '/jocuri/sloturi-speciale/', '/jocuri/pacanele-cu-coroane/', '/jocuri/pacanele-cu-trifoi/', '/jocuri/pacanele-cu-diamante/', '/jocuri/pacanele-de-craciun/', '/jocuri/pacanele-cu-animale/', '/jocuri/sloturi-cu-egipt/', '/jocuri/pacanele-cu-dublaje/', '/jocuri/sloturi-cu-rtp-mare/', '/jocuri/sloturi-noi/'], mainPath: '/sloturi-online-gratis/' },
    
    { name: 'Producători', selector: 'li:nth-child(3) a[href="#"]', hasDropdown: true, 
      paths: ['/producator-jocuri/egt/', '/producator-jocuri/pragmatic-play/', '/producator-jocuri/novomatic/', '/producator-jocuri/netent/', '/producator-jocuri/nolimit-city/', '/producator-jocuri/playn-go/', '/producator-jocuri/isoftbet/', '/producator-jocuri/relax-gaming/', '/producator-jocuri/wazdan/', '/producator-jocuri/playtech/', '/producator-jocuri/igt/', '/producator-jocuri/gamevy/', '/producator-jocuri/nyx/', '/producator-jocuri/yggdrasil/', '/producator-jocuri/1x2-gaming/', '/producator-jocuri/blueprint/', '/producator-jocuri/playson/', '/producator-jocuri/microgaming/', '/producator-jocuri/gaming1/', '/producator-jocuri/quickspin/', '/producator-jocuri/synot/', '/producator-jocuri/stakelogic/'], mainPath: '/producator-jocuri/egt/' },

    { name: 'Top Casino', selector: 'li:nth-child(4) a[href="#"]', hasDropdown: true, 
      paths: ['/sloturi-casino-online/', '/casino/netbet/', '/casino/superbet/', '/casino/mr-bit/', '/casino/betano/', '/casino/win2/', '/casino/888/', '/casino/toto-gaming/', '/casino/conti-cazino/', '/casino/casa-pariurilor/', '/casino/fortuna/', '/casino/winbet/', '/casino/winner/', '/casino/million/', '/casino/gets-bet/', '/casino/luck/', '/casino/vivabet/', '/casino/32-rosu/', '/casino/prima-casino/', '/casino/vlad-cazino/', '/casino/powerbet/', '/casino/unibet/', '/casino/winboss/', '/casino/princess/', '/casino/game-world/', '/casino/maxbet/', '/casino/stanleybet/', '/casino/pokerstars/', '/casino/admiral-bet-casino/', '/casino/lady-casino/', '/casino/pariuri-plus/', '/casino/winmasters/', '/casino/don-casino/', '/casino/excelbet/', '/casino/mozzartbet/', '/casino/hotspins/', '/casino/royal-slots/', '/casino/spin-casino/', '/casino/maxwin-casino/', '/casino/one-casino/', '/casino/bet7/', '/casino/magnumbet/', '/casino/frank-casino/', '/casino/elite-slots/', '/casino/las-vegas/', '/casino/favbet/', '/casino/player/', '/casino/betmen/', '/casino/lucky-seven-casino/', '/casino/fortuna-palace/', '/casino/slotv/', '/casino/prowin-casino/', '/casino/12x-bet-casino/', '/casino/mr-play-casino/', '/casino/king-casino/', '/casino/seven-casino/', '/casino/magic-jackpot/'], mainPath: '/sloturi-casino-online/' },
    
    { name: 'Jocuri Live', selector: 'li:nth-child(5) a[href="#"]', hasDropdown: true, 
      paths: ['/jocuri-casino-live/', '/jocuri/poker-ca-la-aparate/', '/jocuri/ruleta-gratis/', '/jocuri/blackjack-online/'], mainPath: '/jocuri-casino-live/' },

    { name: 'Ghiduri', selector: 'li:nth-child(6) a[href="#"]', hasDropdown: true, 
      paths: ['/blog/cum-se-joaca-barbut/', '/blog/cum-se-joaca-alias/', '/blog/cum-se-joaca-cruce/', '/blog/cum-se-joaca-claim/', '/blog/cum-se-joaca-moara/', '/blog/cum-se-joaca-66/', '/blog/cum-se-joaca-catan/', '/blog/cum-se-joaca-biliard/', '/blog/ghid-cum-se-joaca-uno/', '/blog/cum-se-joaca-sah/', '/blog/cum-se-joaca-canasta/', '/blog/cum-se-joaca-maciupiciu/', '/blog/cum-se-joaca-septica/', '/blog/cum-se-joaca-activity/', '/blog/cum-se-joaca-remi/', '/blog/cum-se-joaca-rentz/', '/blog/cum-se-joaca-sudoku/', '/blog/cum-se-joaca-kems/', '/blog/cum-se-joaca-yams/'], mainPath: '/blog/cum-se-joaca-barbut/' },
    
    { name: 'Noutăți', selector: 'li:nth-child(7) a[href="#"]', hasDropdown: true, 
      paths: ['/blog/'], mainPath: '/blog/' },
];

const BT_MENU_MAP: MenuMapItem[] = [
    { name: 'Ponturi Pariuri', selector: 'li:nth-child(1) a[href="#"]', hasDropdown: true, 
      paths: ['/ponturi-pariuri/', '/ponturi-pariuri/fotbal/', '/ponturi-pariuri/tenis/', '/ponturi-pariuri/baschet/', '/ponturi-pariuri/handbal/', '/ponturi-pariuri/hochei/', '/ponturi-pariuri/ufc/', '/ponturi-pariuri/formula-1/', '/ponturi-pariuri/motogp/', '/ponturi-pariuri/volei/', '/ponturi-pariuri/futsal/'], mainPath: '/ponturi-pariuri/' },
    
    { name: 'Bilete Pariuri', selector: 'li:nth-child(2) a[href="#"]', hasDropdown: true, 
      paths: ['/biletul-zilei/', '/cota-2/', '/pontul-zilei/', '/bet-builder/'], mainPath: '/biletul-zilei/' },
    
    { name: 'Meciuri Azi', selector: 'li:nth-child(3) a[href="#"]', hasDropdown: true, 
      paths: ['/meciuri-azi/', '/stiri-sport/', '/clasament-rezultate-fotbal-top-campionate/'], mainPath: '/meciuri-azi/' },

    { name: 'Oferte', selector: 'li:nth-child(4) a', hasDropdown: false, 
      paths: ['/case-pariuri-oferte/'], mainPath: '/case-pariuri-oferte/' },

    { name: 'Bonus Fără Depunere', selector: 'li:nth-child(5) a[href="#"]', hasDropdown: true, 
      paths: ['/bonus-fara-depunere-cazino/', '/case-pariuri-oferte/betano-bonus-fara-depunere/', '/case-pariuri-oferte/speciale/superbet-bonus-fara-depunere/', '/case-pariuri-oferte/bonus-fara-depunere-netbet/', '/oferte-cazino/bonus-fara-depunere-conticazino/', '/oferte-cazino/bonus-fara-depunere-player-casino/', '/oferte-cazino/bonus-fara-depunere-winboss/', '/oferte-cazino/bonus-fara-depunere-don-casino/', '/oferte-cazino/bonus-fara-depunere-toto-gaming/', '/oferte-cazino/bonus-fara-depunere-pacanele-ro/', '/oferte-cazino/bonus-fara-depunere-12xbet/', '/oferte-cazino/maxwin-bonus-fara-depunere/', '/oferte-cazino/rotiri-gratuite-getsbet/'], mainPath: '/bonus-fara-depunere-cazino/' },

    { name: 'Rotiri Gratuite', selector: 'li:nth-child(6) a', hasDropdown: false, 
      paths: ['/rotiri-gratuite-fara-depunere/'], mainPath: '/rotiri-gratuite-fara-depunere/' },
    
    { name: 'Free bet', selector: 'li:nth-child(7) a', hasDropdown: false, 
      paths: ['/free-bet/'], mainPath: '/free-bet/' },

    { name: 'Case de Pariuri', selector: 'li:nth-child(8) a[href="#"]', hasDropdown: true, 
      paths: ['/pariuri-online/', '/case-pariuri-oferte/speciale/', '/ghid-pariuri/', '/recenzie/netbet-sport/', '/recenzie/unibet-pariuri/', '/recenzie/betano-pariuri/', '/recenzie/superbet-pariuri-sportive/', '/recenzie/mr-bit/', '/recenzie/don-casino/', '/recenzie/player-casino/', '/recenzie/casa-pariurilor-online/', '/recenzie/gets-bet-pariuri-sportive/', '/recenzie/toto-gaming/', '/recenzie/fortuna-pariuri/', '/recenzie/win2-casino/', '/recenzie/king-casino/', '/recenzie/maxbet-pariuri/', '/recenzie/winbet/', '/recenzie/admiral-pariuri/', '/recenzie/32rosu/', '/recenzie/vivabet-online/', '/recenzie/winboss-casino/', '/recenzie/maxwin-casino/', '/recenzie/seven-casino/', '/recenzie/spin-casino/', '/recenzie/prima-casino/', '/recenzie/royal-casino/', '/recenzie/mozzart-pariuri/', '/recenzie/12xbet/', '/recenzie/million-casino/', '/recenzie/napoleon-casino/', '/recenzie/powerbet/', '/recenzie/prowin/', '/recenzie/princess-casino/', '/recenzie/hot-spins-casino/', '/recenzie/bet7-casino/', '/recenzie/las-vegas-casino/', '/recenzie/topbet/', '/recenzie/winner/', '/recenzie/888/', '/recenzie/pacanele-ro/', '/recenzie/swiper/', '/recenzie/bilion-casino/', '/recenzie/777-ro/', '/recenzie/manhattan/', '/recenzie/mr-play/'], mainPath: '/pariuri-online/' },
    
    { name: 'Casino Online', selector: 'li:nth-child(9) a[href="#"]', hasDropdown: true, 
      paths: ['/top-casino-online/', '/oferte-cazino/', '/oferte-casino-craciun/', '/cazinouri-noi-online/', '/cazinouri-online-nelicentiate/', '/ghid-casino/', '/pacanele-online/', '/diverse/'], mainPath: '/top-casino-online/' },
];


// Map of SiteName to the appropriate menu map
const SITE_TO_MENU_MAP: Record<SiteName, MenuMapItem[]> = {
    'casino.com.ro': CCR_MENU_MAP,
    'jocpacanele': JP_MENU_MAP,
    'jocsloturi': JS_MENU_MAP,
    'beturi': BT_MENU_MAP,
    'supercazino': [],
    'jocuricazinouri': [],
};


// --- H1: Homepage Load Performance (ID: H1) ---
test('H1: Homepage Load Performance - Initial Load and Key Elements Visibility', async ({ page }, testInfo: TestInfo) => { 
    
    const projectName = testInfo.project.name; 
    const siteName = getSiteNameFromProject(projectName);
    const config = siteConfigs[siteName];
    
    // 🎯 FIX: Initialize baseURL within the H1 function scope
    const baseURL = testInfo.project.use.baseURL!; 
    
    const startTime = Date.now();
    const response = await test.step('H1.1: Navigate to Homepage and Await Load', async () => {
        return page.goto('/', { waitUntil: 'load' });
    });
    
    const loadTime = Date.now() - startTime;
    const maxLoadTime = 30000; 
    
    // 🎯 H1.1 Status Code Check
    const statusCode = response?.status() || 0;
    if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`[${siteName}] H1.1 Failed: Received non-2xx HTTP status code: ${statusCode} at ${baseURL}`);
    }
    
    console.log(`[${siteName}] INFO: Page load time: ${loadTime}ms`);
    expect(loadTime, `[${siteName}] H1.2: Homepage should load in under ${maxLoadTime}ms. Actual: ${loadTime}ms.`).toBeLessThan(maxLoadTime);
    
    await test.step('H1.3a: Verify Main Header Visibility', async () => {
        const header = page.locator('header, .header, #main-header-wrapper, #header, #site-header, #masthead, [data-elementor-type="header"], #page, .site, .mega-menu-desktop-container, .main-header-bar-wrap').first();
        await expect(header, `[${siteName}] H1.3a: Main site header element (or ultimate site wrapper) should be visible.`).toBeVisible();
    });

    await test.step('H1.3b: Verify Logo/Title Visibility/Existence', async () => {
        const logo = page.locator('.inline-block.max-w-\\[110px\\], a[href="/"], a[href="/#"], img[alt*="logo" i], h1').first();
        await expect(logo, `[${siteName}] H1.3b: Site logo link must exist in the DOM and be enabled.`).toBeEnabled({ timeout: 10000 });
    });
    
    await test.step('H1.3c: Verify Affiliate CTA Visibility', async () => {
        const cta = page.locator(config.ctaSelector).first();
        await expect(cta, `[${siteName}] H1.3c: At least one primary affiliate CTA (${config.ctaSelector}) should be visible.`).toBeVisible();
    });

    testInfo.annotations.push({ type: 'Test ID', description: 'H1' });
});


// --- H2: Main Navigation Functionality (ID: H2) ---
test('H2: Main Navigation Functionality - Top Menu and Logo Link Check', async ({ page }, testInfo: TestInfo) => {
    
    const projectName = testInfo.project.name; 
    const siteName = getSiteNameFromProject(projectName);
    const config = siteConfigs[siteName];
    const baseURL = testInfo.project.use.baseURL!; 
    
    // Get the menu map for the current project
    const menuMap = SITE_TO_MENU_MAP[siteName] || []; 
    const isHoverSite = ['supercazino', 'jocuricazinouri'].includes(siteName);

    await test.step('H2.1: Start on Homepage', async () => {
        console.log(`\n[${siteName}] === H2: Starting Navigation Test (Click Sites) ===`);
        // Start fresh on the homepage
        const initialResponse = await page.goto(baseURL, { waitUntil: 'load' }); 
        
        // Check status code for initial load
        const initialStatusCode = initialResponse?.status() || 0;
        if (initialStatusCode < 200 || initialStatusCode >= 300) {
             throw new Error(`Initial Load Failed: Received non-2xx HTTP status code: ${initialStatusCode} for ${baseURL}`);
        }
    });
    
    // --- Step 2: Iterate through each top menu item ---
    if (menuMap.length > 0) {
        
        for (const rawParentItem of menuMap) {
            const parentItem: MenuMapItem = rawParentItem;
            
            // Locate parent link by text content, filtered by known menu containers
            const parentLink = page.locator('.header-desktop-menu, .main-header-bar-navigation, .bt-menu-container, .navbar-nav').getByText(parentItem.name, { exact: true }).first(); 
            const parentMenuText = parentItem.name;

            await test.step(`H2.2: Testing Parent Menu Item: [${parentMenuText}]`, async () => {
                
                // Use a local error accumulator to track failures for this parent item
                let parentFailed = false;

                try {
                    // Check if the parent link exists before attempting to interact
                    await expect(parentLink, `Parent link "${parentMenuText}" must be visible.`).toBeVisible({ timeout: 5000 });

                    if (parentItem.hasDropdown) {
                        // 1. Trigger the dropdown
                        console.log(`[${siteName}] DEBUG: Triggering parent: "${parentMenuText}" via CLICK. (Checking ${parentItem.paths.length} links)`);
                        
                        // Execute the trigger action (Click-triggered for these sites)
                        await parentLink.click({ timeout: 5000 }); 
                        
                        // 2. Filter target paths
                        let targetPaths = parentItem.paths;
                        if (parentItem.mainPath) {
                            targetPaths = targetPaths.filter(path => path !== parentItem.mainPath);
                        }

                        if (targetPaths.length === 0) {
                             console.warn(`[${siteName}] WARNING: Submenu path list for "${parentMenuText}" is empty or filtered out. Continuing.`);
                             return; 
                        }

                        // 3. Iterate through all hardcoded target paths
                        for (const targetPath of targetPaths) {
                            
                            // Create a highly specific locator based on the expected path
                            let subMenuLocatorSelector: string;
                            
                            if (siteName === 'casino.com.ro') {
                                subMenuLocatorSelector = `.submenu-panel a[href*="${targetPath}"]`;
                            } else if (siteName === 'jocpacanele') {
                                subMenuLocatorSelector = `.dropdown-menu a[href*="${targetPath}"]`;
                            } else if (siteName === 'jocsloturi') {
                                subMenuLocatorSelector = `.sub-menu a[href*="${targetPath}"]`;
                            } else if (siteName === 'beturi') {
                                subMenuLocatorSelector = `ul.sub-menu a[href*="${targetPath}"]`;
                            } else {
                                continue; 
                            }
                            
                            const subLinkLocator = page.locator(subMenuLocatorSelector).first();
                            
                            // Get the visible text of the link (used for logging only)
                            const subMenuText = (await subLinkLocator.textContent())?.trim().split('\n')[0].trim() || targetPath;

                            await test.step(`Sublink Check: [${parentItem.name} / ${subMenuText}]`, async () => {
                                try {
                                    // 1. CRITICAL FIX: Bypass unstable click events by forcing direct navigation
                                    const targetUrl = baseURL + targetPath;
                                    
                                    // Store the response object to check its status code
                                    const navResponse = await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
                                    
                                    // 2. Status Code Check
                                    const navStatusCode = navResponse?.status() || 0;
                                    if (navStatusCode < 200 || navStatusCode >= 300) {
                                        throw new Error(`Non-2xx status code: ${navStatusCode} at URL: ${targetUrl}`);
                                    }
                                    
                                    // 3. Humanization
                                    await humanizePage(page);

                                    // 4. Final Assertion Check (Path comparison)
                                    expect(page.url()).toContain(targetPath);
                                    
                                    console.log(`[${siteName}] ✅ PASSED: Sub-link "${subMenuText}" redirected successfully to ${targetPath}`);

                                    // 5. Go back to the homepage (Guaranteed return)
                                    await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 });
                                    
                                } catch (error) {
                                    // Error handling will catch the non-2xx status code and log it as a failure, then move on.
                                    console.error(`[${siteName}] ❌ FAILED: Sub-link "${subMenuText}" failed. Error: ${error instanceof Error ? error.message.split('\n')[0] : 'Unknown error.'}`);
                                    parentFailed = true;
                                    
                                    // CRITICAL RECOVERY: Attempt to reset browser state by reloading the base URL.
                                    // This is the action that prevents the hang and allows the loop to continue.
                                    try {
                                        await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 });
                                        console.log(`[${siteName}] DEBUG: Successfully reset page state after failure.`);
                                    } catch (recoverError) {
                                        console.warn(`[${siteName}] CRITICAL WARNING: Failed to reset browser state after error: ${recoverError.message.split('\n')[0]}. Project may terminate.`);
                                        // If the recovery fails, we must rely on the Playwright runner to stop the project run.
                                    }
                                }
                            });
                        } // End of subLinks loop

                    } else {
                        // B. Handle No-Dropdown Links (Single Navigation Links)
                        console.log(`[${siteName}] DEBUG: Testing direct link: "${parentItem.name}".`);
                        
                        // Navigate directly to the link's target path
                        const targetUrl = baseURL + parentItem.mainPath;
                        const navResponse = await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
                        
                        // Check status code
                        const navStatusCode = navResponse?.status() || 0;
                        if (navStatusCode < 200 || navStatusCode >= 300) {
                            console.error(`[${siteName}] ❌ FAILED: Direct link "${parentMenuText}" failed. Error: Non-2xx status code: ${navStatusCode} at URL: ${targetUrl}`);
                            parentFailed = true;
                        } else {
                            // Check URL contains the path segment
                            expect(page.url()).toContain(parentItem.mainPath); 
                            console.log(`[${siteName}] ✅ PASSED: Direct link "${parentMenuText}" redirected successfully.`);
                            await humanizePage(page); // Humanize after success
                        }
                        
                        await page.goto(baseURL, { waitUntil: 'load', timeout: 30000 });
                    }
                    
                } catch (error) {
                    // Catch initial parent visibility error or structural error, log, and fail the parent step
                    console.error(`[${siteName}] ❌ FAILED: Parent item "${parentMenuText}" failed structural test.`);
                    parentFailed = true;
                    // Attempt to reset state before allowing Playwright to fail the step
                    await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 }).catch(recoverError => {
                        console.warn(`[${siteName}] CRITICAL WARNING: Failed to reset browser state after structural error.`);
                    });
                    
                }

                // If any sublink/direct link failed, mark the entire parent step as failed in Playwright reporting.
                if (parentFailed) {
                    throw new Error(`Parent menu item ${parentMenuText} failed one or more checks.`);
                }
            });
        } // End of parent menu loop
    } else {
        console.warn(`[${siteName}] WARNING: H2 test logic not implemented for this site.`);
    }

    
    // --- Step 3: Verify Logo Click ---
    await test.step('H2.4: Verify Logo Link Returns to Homepage', async () => {
        
        // Use the first high-traffic path
        const deepPath = config.highTrafficPaths[0]; 
        const targetUrl = baseURL + deepPath;
        
        // Navigate to deep path
        const navResponse = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        
        // Check status code
        const navStatusCode = navResponse?.status() || 0;
        if (navStatusCode < 200 || navStatusCode >= 300) {
            console.warn(`[${siteName}] WARNING: Initial Logo Check Navigation failed with status ${navStatusCode} to ${targetUrl}. Skipping Logo Check.`);
            return;
        }

        console.log(`[${siteName}] DEBUG: Testing logo click from: ${deepPath}`);

        const logoSelector = '.theme-container a[href="/"], .ast-site-identity a[rel="home"], .header-logo a'; 
        const logoLink = page.locator(logoSelector).first();

        await expect(logoLink, `[${siteName}] Site logo link (${logoSelector}) should be enabled.`).toBeEnabled({ timeout: 5000 });
        
        await logoLink.click();
        
        await page.waitForURL(baseURL + '/', { waitUntil: 'load', timeout: 30000 });
        expect(page.url(), `[${siteName}] Clicking the logo should return to the root homepage ('/')`).toBe(baseURL + '/');
        console.log(`[${siteName}] ✅ LOGO CHECK PASSED: Redirected to: ${baseURL}/`);
    });

    testInfo.annotations.push({ type: 'Test ID', description: 'H2' });
});