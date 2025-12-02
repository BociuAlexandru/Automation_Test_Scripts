// playwright.config.ts

import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',

    // ➡️ FIX: Explicitly set output directory outside the default volatile location.
    outputDir: './artifact-history', 

    // ⏱️ Hard set per-test timeout to 120 minutes (2 hours)
    timeout: 120 * 60 * 1000,
    
    // OPTIMIZATION: Set workers to a stable number
    workers: process.env.CI ? 1 : 3,

    // FIX: Retain artifacts for successful runs and failures
    retries: 1, 
    reporter: [
      ['list'], // Standard list reporter
      ['html', { outputFolder: 'playwright-report', open: 'never' }]
    ],

    use: {
        navigationTimeout: 60000, // 60s per page load
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        
        // ⚠️ ANTI-BOT/RESILIENCE SETTINGS
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ignoreHTTPSErrors: true,
        viewport: { width: 1920, height: 1080 }, // Consistent desktop size
        permissions: ['geolocation'],
        timezoneId: 'Europe/Bucharest',
        locale: 'ro-RO',
        
        // FINALIZED ANTI-DETECTION HTTP HEADERS
        extraHTTPHeaders: {
            'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        },
        
        launchOptions: {
          args: [
            // Disables common automation flags
            '--disable-blink-features=AutomationControlled',
            '--exclude-switches=enable-automation',
            '--disable-dev-shm-usage',
            '--enable-features=NetworkService,NetworkServiceInProcess',
            '--window-size=1920,1080',
          ],
        },
    }, 
    
    projects: [
        // Projects are ordered to start with casino.com.ro
        { name: 'casino.com.ro', use: { baseURL: 'https://casino.com.ro' } },
        { name: 'supercazino', use: { baseURL: 'https://www.supercazino.ro' } },
        { name: 'jocpacanele', use: { baseURL: 'https://jocpacanele.ro' } },
        { name: 'jocuricazinouri', use: { baseURL: 'https://jocuricazinouri.com' } },
        { name: 'jocsloturi', use: { baseURL: 'https://jocsloturi.ro' } },
        { name: 'beturi', use: { baseURL: 'https://beturi.ro' } },
    ],
});


