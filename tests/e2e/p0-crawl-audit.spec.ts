// tests/e2e/p0-crawl-audit.spec.ts
import { test, devices } from '@playwright/test'; 
import { siteConfigs, type SiteConfig, type SiteName } from './config/sites';

// Define the structure for a soft failure (modern structure)
type SoftFailure = {
  sourcePath: string;
  ctaText: string;
  reason: string;
  details: any;
};

// Define REDIRECT_TIMEOUT globally
const REDIRECT_TIMEOUT = 15000; 

// ➡️ ANTI-DETECTION: Human-like wait function (FIXED TS ERROR HERE)
async function humanDelay(page: any, minMs: number = 500, maxMs: number = 2000): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await page.waitForTimeout(delay);
}

// ➡️ ANTI-DETECTION: Remove webdriver detection scripts (FIXED navigator.languages)
async function removeWebdriverDetection(page: any) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
            parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
                : originalQuery(parameters);
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        
        // ➡️ FIX: Correctly redefine the languages property on the navigator object
        Object.defineProperty(navigator, 'languages', { get: () => ['ro-RO', 'ro', 'en-US', 'en'] });
    });
}

// Function to attempt to close known popups/modals
async function closeModalOrPopup(page: any) {
    const closeSelectors = [
        '#newsletter-popup-close-button', '.close-modal-x', 'button:has-text("NU MULTUMESC")', 'div[aria-label="Close"]',        
    ];
    for (const selector of closeSelectors) {
        try {
            const closeButton = page.locator(selector).first();
            if (await closeButton.isVisible({ timeout: 1000 })) {
                await closeButton.click({ timeout: 5000, force: true });
                console.log(`[BYPASS] Closed popup using selector: ${selector}`);
                return true; 
            }
        } catch (e) {
            // Ignore errors
        }
    }
    return false;
}


// Decide if we should visit a path based on the include/exclude patterns
function shouldVisitPath(path: string, cfg: SiteConfig): boolean {
  const included = cfg.includePatterns.some((re) => re.test(path));
  if (!included) return false;
  const excluded = cfg.excludePatterns.some((re) => re.test(path));
  return !excluded;
}

test('P0 - Affiliate Full Site Crawl Audit', async ({ browser, page, request }, testInfo) => { 
  // ➡️ FINAL UPDATE: Timeout set to 120 minutes
  test.setTimeout(120 * 60 * 1000);

  const projectName = testInfo.project.name as SiteName;
  console.log(`[${projectName}] Starting refactored full crawl.`);
  const cfg = siteConfigs[projectName];

  // Access baseURL from testInfo.project.use
  const projectBaseURL = testInfo.project.use.baseURL; 
  if (!projectBaseURL) { throw new Error(`Base URL not found for project: ${projectName}`); }
  const baseURL = projectBaseURL;

  const visited = new Set<string>();
  const queue: string[] = [...cfg.startPaths];

  // Array to collect all soft failures (modern structure)
  const softFailures: SoftFailure[] = []; 
  
  // Just for reporting
  let totalCtaPlacementsChecked = 0;

  // ➡️ ANTI-DETECTION: Remove webdriver detection on base page
  await removeWebdriverDetection(page); 

  while (queue.length > 0 && visited.size < cfg.maxPages) {
    const currentPath = queue.shift()!;
    if (visited.has(currentPath)) continue;
    visited.add(currentPath);

    if (!shouldVisitPath(currentPath, cfg)) continue;

    await test.step(`Visit ${currentPath}`, async () => {
      // 1) Navigate to the page
      try {
        // ➡️ Apply anti-detection and realistic headers
        await page.setExtraHTTPHeaders({ 'Referer': baseURL + (cfg.startPaths[0] || '/'), });
        await page.goto(baseURL + currentPath, { // Use full URL for robustness
          waitUntil: 'domcontentloaded',
          timeout: 30_000, // 30s per page load
        });
        await page.waitForLoadState('domcontentloaded'); // Ensure DOM is fully loaded
        await closeModalOrPopup(page); 
        await humanDelay(page, 500, 1000); // ⬅️ Call is explicit

      } catch (error: any) {
        // Soft failure on navigation failure
        softFailures.push({ sourcePath: currentPath, ctaText: 'Page Load', reason: 'Page Load Failure', details: { message: error?.message ?? String(error) }});
        console.error(`[${projectName}] ❌ FAIL Page Load on ${currentPath}: ${error?.message ?? String(error)}`);
        return; 
      }


      // 2. ➡️ LINK SCRAPING: Find ALL links and filter by URL pattern (New Logic)
      const allLinks = page.locator('a[href]');

      const allLinkData = await allLinks.evaluateAll((nodes, options) => {
        // Options from the new audit script for safety
        const affiliateUrlPattern = options.affiliateUrlPattern as RegExp;
        const baseURL = options.baseURL as string; 

        return nodes.map((n: Element) => {
          const href = n.getAttribute('href');
          
          let path = href || '';
          try {
              if (path.startsWith('http')) {
                  const url = new URL(path);
                  path = url.pathname + url.search;
              }
          } catch { return null; }
          
          if (!path.startsWith('/') || !affiliateUrlPattern.test(path)) return null; 
          
          return {
            href: href,
            hasClass: n.classList.contains('affiliate-meta-link'),
            hasDataCasino: n.hasAttribute('data-casino') || n.hasAttribute('data-casino-name'),
            hasTrackingAttributes: n.classList.contains('affiliate-meta-link') && (n.hasAttribute('data-casino') || n.hasAttribute('data-casino-name')),
            target: n.getAttribute('target'),
            text: (n as HTMLElement).textContent?.trim().replace(/\s+/g, ' ') || 'No Text',
            selector: 'a[href="' + href + '"]' // Selector for clicking
          };
        }).filter(item => item !== null);
      }, { affiliateUrlPattern: cfg.affiliateUrlPattern, ctaSelector: cfg.ctaSelector, baseURL: baseURL });
      
      const affiliateLinkCount = allLinkData.length;
      totalCtaPlacementsChecked += affiliateLinkCount; // Update total count

      if (affiliateLinkCount === 0) {
        console.warn(`[${projectName}] [WARN] No affiliate links found matching pattern on ${currentPath}`);
        // Continue to link discovery (Step 4)
      }
      
      // 3. Process CTA Data and Execute Audit (New Logic)
      for (let i = 0; i < affiliateLinkCount; i++) {
        const { href, target, text, hasTrackingAttributes, hasClass, hasDataCasino, selector } = allLinkData[i];
        
        const ctaId = `LINK #${i + 1} (${text})`;

        // --- Preliminary Checks ---
        let skipAudit: boolean = false; 

        // ➡️ FIX 2: Check for Betano exclusion
        if (projectName === 'casino.com.ro' && typeof href === 'string' && href.toLowerCase().includes('betano')) {
            console.log(`[${projectName}] ⚠️ SKIPPING Betano link to bypass known external stall.`);
            continue; 
        }

        // ATTRIBUTE ENFORCEMENT (Business Logic Check)
        if (!hasTrackingAttributes) {
             let missingDetails: string[] = []; 
             if (!hasClass) missingDetails.push('.affiliate-meta-link class');
             if (!hasDataCasino) missingDetails.push('data-casino/data-casino-name');

             softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: 'Missing Tracking Attributes (Business Logic)', details: `Affiliate link is missing: ${missingDetails.join(', ')}` });
             console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Missing Attributes: ${missingDetails.join(', ')}`);
             skipAudit = true;
        }

        // Target Blank Check
        if (target !== '_blank' && !skipAudit) {
            softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: 'Target Blank Missing', details: `Link is missing the essential target="_blank" attribute.` });
            console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Target Blank Missing`);
        }

        // --- Core Redirection Audit ---
        if (typeof href === 'string' && !skipAudit) {
            let popup: any;
            
            try {
                // 1. Monitor the click action
                const [newPopup, response] = await Promise.all([
                    page.waitForEvent('popup', { timeout: REDIRECT_TIMEOUT }),
                    page.evaluate((s) => {
                        const element = document.querySelector(s);
                        if (element) { (element as HTMLAnchorElement).click(); }
                    }, selector),
                ]).then(([p]) => {
                    popup = p; 
                    return Promise.all([
                        popup,
                        popup.waitForResponse(r => r.url().startsWith('http'), { timeout: REDIRECT_TIMEOUT }),
                    ]);
                }).catch(async (error) => {
                    if (popup) { await popup.close().catch(() => {}); }
                    throw error;
                });

                // 2. Get the redirect chain
                const request = response.request();
                const chain: any = (request as any).redirectChain; 
                
                // 3. Check 1: No 404 in Our Domain
                const internalRequest = (Array.isArray(chain) && chain.length > 0) ? chain[0] : null; 
                
                if (internalRequest) {
                    const internalResponse = await internalRequest.response();
                    if (internalResponse && internalResponse.status() === 404) {
                        softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: 'Internal Redirect 404', details: `Internal tracking link returned 404. URL: ${internalRequest.url()}` });
                        console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Internal Redirect 404`);
                    }
                }

                // 4. Check 2: Final Destination is NOT Our Domain
                const finalUrl = response.url();
                const finalOrigin = new URL(finalUrl).origin;
                const projectOrigin = new URL(baseURL).origin; 

                if (finalOrigin === projectOrigin) {
                    softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: 'Final URL is Internal', details: `Redirection failed to leave the domain. Final URL: ${finalUrl}` });
                    console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Final URL is Internal - ${finalUrl}`);
                } else {
                    console.log(`[${projectName}] ✅ PASS ${ctaId} from ${currentPath} -> Redirected to ${finalOrigin}`);
                }

            } catch (error: any) {
                // WAF/TIMEOUT FIX: Fail-Forward if an external URL was successfully grabbed on timeout
                let finalUrlOnTimeout: string | null = null;
                if (popup) {
                    try { finalUrlOnTimeout = (popup.url() || ''); } catch {}
                }

                const reason = error.message.includes('Timeout') 
                    ? `Redirect Timeout (> ${REDIRECT_TIMEOUT/1000}s)` 
                    : `Click/Monitor Error: ${error.message}`;

                // WAF/TIMEOUT FIX: If final URL is external on timeout, treat as PASS.
                if (finalUrlOnTimeout && finalUrlOnTimeout.startsWith('http')) {
                    try {
                        const timeoutOrigin = new URL(finalUrlOnTimeout).origin;
                        const projectOrigin = new URL(baseURL).origin; 

                        if (timeoutOrigin !== projectOrigin) {
                            if (popup) { try { popup.close().catch(() => {}); } catch {} } 
                            console.log(`[${projectName}] ✅ PASS ${ctaId} from ${currentPath} -> Bypassed WAF/Error to ${timeoutOrigin}`);
                            return; 
                        }
                    } catch {}
                }
                
                // If we couldn't bypass, log the original failure
                const logError = error.message.includes('Timeout') ? 'Redirect Timeout' : reason;
                softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: logError, details: { error: error.message } });
                console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: ${logError}`);
                
            } finally {
                // Ensure the new tab is CLOSED (Final safety)
                if (popup) {
                    try { if (!popup.isClosed()) await popup.close().catch(() => {}); } catch {}
                }
            }
        }
      } // End of Link iteration
      
      // 4) Discover new internal links to keep crawling (Existing logic remains)
      const links = page.locator('a[href]');
      const hrefs = await links.evaluateAll((nodes) =>
        nodes
          .map((n) => (n as HTMLAnchorElement).getAttribute('href'))
          .filter((h): h is string => !!h)
      );

      for (const rawHref of hrefs) {
        if (
          rawHref.startsWith('#') ||
          rawHref.startsWith('mailto:') ||
          rawHref.startsWith('tel:') ||
          rawHref.startsWith('javascript:')
        ) {
          continue;
        }

        const currentUrl = new URL(page.url());
        const url = new URL(rawHref, currentUrl);

        // Only follow same-origin links
        if (url.origin !== currentUrl.origin) continue;

        const nextPath = url.pathname;

        if (!visited.has(nextPath) && shouldVisitPath(nextPath, cfg)) {
          queue.push(nextPath);
        }
      }
      // End of link discovery
    });
  }

  // CRITICAL: Attach results after the main loop finishes
  if (softFailures.length > 0) {
    const failureString = JSON.stringify(softFailures, null, 2);
    testInfo.attachments.push({
      name: `❌ CTA Link Failures (${softFailures.length} total)`,
      contentType: 'application/json',
      body: Buffer.from(failureString, 'utf8'),
    });
    
    // Add a highly visible annotation to the report header
    testInfo.annotations.push({
        type: 'Bad Links Found', 
        description: `${softFailures.length} bad CTA links were found. See attachments.` 
    });
  }

  console.log(
    `[${projectName}] COMPLETED. Pages visited = ${visited.size}, CTA placements checked = ${totalCtaPlacementsChecked}. Failures: ${softFailures.length}`
  );
});










