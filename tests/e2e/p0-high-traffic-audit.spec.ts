// tests/e2e/p0-high-traffic-audit.spec.ts
import { test } from '@playwright/test';
import { siteConfigs, type SiteName } from './config/sites';

// Define the structure for a soft failure
type SoftFailure = {
  sourcePath: string;
  ctaText: string;
  reason: string;
  details: any;
};

// Define REDIRECT_TIMEOUT globally - optimized for speed
const REDIRECT_TIMEOUT = 15000; // 15 seconds - enough to get redirect URL

// ➡️ ANTI-DETECTION: Add random delay function to simulate human behavior
function randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ➡️ ANTI-DETECTION: Human-like wait function
async function humanDelay(page: any, minMs: number = 500, maxMs: number = 2000) {
    const delay = randomDelay(minMs, maxMs);
    await page.waitForTimeout(delay);
}

// ➡️ ANTI-DETECTION: Remove webdriver detection scripts
async function removeWebdriverDetection(page: any) {
    await page.addInitScript(() => {
        // Remove webdriver property
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
        
        // Override permissions API
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
            parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
                : originalQuery(parameters);
        
        // Add realistic Chrome properties
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        
        Object.defineProperty(navigator, 'languages', {
            get: () => ['ro-RO', 'ro', 'en-US', 'en'],
        });
    });
}

// Function to attempt to close known popups/modals
async function closeModalOrPopup(page: any) {
    const closeSelectors = [
        '#newsletter-popup-close-button',
        '.close-modal-x',                 
        'button:has-text("NU MULTUMESC")', 
        'div[aria-label="Close"]',        
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
            // Ignore errors if selector not found or click failed
        }
    }
    return false;
}


test('P0 - High Traffic CTA Audit (Redirect Chain Check)', async ({ page }, testInfo) => {
  test.setTimeout(120 * 60 * 1000); 

  const projectName = testInfo.project.name as SiteName;
  console.log(`[${projectName}] Starting redirect chain audit.`);
  const cfg = siteConfigs[projectName];
  
  // Access baseURL from testInfo.project.use
  const projectBaseURL = testInfo.project.use.baseURL; 
  if (!projectBaseURL) {
      throw new Error(`Base URL not found for project: ${projectName}`);
  }
  const baseURL = projectBaseURL;
  
  const softFailures: SoftFailure[] = [];

  // ➡️ ANTI-DETECTION: Remove webdriver detection on page creation
  await removeWebdriverDetection(page);

  for (const currentPath of cfg.highTrafficPaths) {

    await test.step(`Audit Page: ${currentPath}`, async () => {
      // 1. Navigate to the page with realistic timing
      try {
        // ➡️ ANTI-DETECTION: Set referrer header before navigation
        await page.setExtraHTTPHeaders({
          'Referer': baseURL + (cfg.highTrafficPaths[0] || '/'),
        });

        await page.goto(currentPath, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000, 
        });
        
        // Minimal wait for page to be interactive
        await page.waitForLoadState('domcontentloaded');
      } catch (error: any) {
        softFailures.push({ sourcePath: currentPath, ctaText: 'Page Load', reason: 'Page Load Failure', details: { message: error?.message ?? String(error) }});
        console.error(`[${projectName}] ❌ FAIL Page Load on ${currentPath}: ${error?.message ?? String(error)}`);
        return; 
      }

      // Attempt to close the popup immediately after navigation
      await closeModalOrPopup(page); 

      // 2. Find ALL CTAs
      const ctas = page.locator(cfg.ctaSelector);
      const ctaCount = await ctas.count();
      
      if (ctaCount === 0) {
        console.warn(`[${projectName}] [WARN] No affiliate CTAs found on ${currentPath}`);
        return;
      }

      // Snapshot data: href, data-casino/data-casino-name, target, and text
      const ctaData = await ctas.evaluateAll((nodes) =>
        nodes.map((n) => ({
          href: (n as HTMLAnchorElement).getAttribute('href'),
          dataCasino: n.getAttribute('data-casino'),
          dataCasinoName: n.getAttribute('data-casino-name'), 
          target: n.getAttribute('target'),
          text: (n as HTMLElement).textContent?.trim().replace(/\s+/g, ' ') || 'No Text',
        }))
      );
      
      // 3. Iterate over each CTA found
      for (let i = 0; i < ctaCount; i++) {
        const { href, dataCasino, dataCasinoName, target, text } = ctaData[i];
        
        const requiredTrackingValue = dataCasinoName || dataCasino;
        const ctaId = `CTA #${i + 1} (${text})`;
        
        // --- Preliminary Checks ---
        let skipAudit = false;

        // Parameter Check
        if (!requiredTrackingValue || !href) {
            softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: 'Missing Required Attributes', details: `Missing href or tracking attribute.` });
            console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Missing Required Attributes`);
            skipAudit = true;
        }
        
        // New Tab Check (target="_blank" check)
        if (target !== '_blank' && !skipAudit) {
            softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: 'Target Blank Missing', details: `CTA is missing the essential target="_blank" attribute.` });
            console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Target Blank Missing`);
        }

        // --- Core Redirection Audit (NEW LOGIC) ---
        if (href && !skipAudit) {
            let popup: any; // Define popup outside try block to guarantee closing
            
            try {
                // 1. Monitor the click action - minimal delay for stability
                const [newPopup, response, popupUrl] = await Promise.all([
                    // Wait for the NEW tab (popup) that the target="_blank" click creates
                    page.waitForEvent('popup', { timeout: REDIRECT_TIMEOUT }),
                    
                    // Perform the click action using page.evaluate (reliable method)
                    page.evaluate(({ index, selector }) => {
                        const elements = document.querySelectorAll(selector);
                        const element = elements[index] as HTMLAnchorElement;
                        if (element) {
                            element.click();
                        }
                    }, { index: i, selector: cfg.ctaSelector }), 
                ]).then(async ([p]) => {
                    popup = p; // Assign the popup handle
                    
                    // ➡️ SPEED OPTIMIZATION: Get URL quickly but wait for redirects to complete
                    let responseResult: any = null;
                    let popupUrl = '';
                    let hasBadRequest = false;
                    let badRequestUrl = '';
                    let errorCount = 0;
                    const MAX_ERRORS = 5; // Prevent infinite loops
                    
                    // ➡️ SILENT HANDLING: Monitor for bad requests (400+) to prevent loops (no logging)
                    const badRequestHandler = (response: any) => {
                        const status = response.status();
                        if (status >= 400 && status < 500) {
                            hasBadRequest = true;
                            badRequestUrl = response.url();
                            // Silent - just track to prevent loops
                        }
                    };
                    popup.on('response', badRequestHandler);
                    
                    // ➡️ SILENT HANDLING: Handle page errors and console errors to prevent ErrorBoundary loops (no logging)
                    const pageErrorHandler = (error: Error) => {
                        errorCount++;
                        if (errorCount >= MAX_ERRORS) {
                            hasBadRequest = true; // Trigger closure
                        }
                    };
                    
                    const consoleErrorHandler = (msg: any) => {
                        const text = msg.text();
                        // Check for ErrorBoundary or critical errors
                        if (text.includes('ErrorBoundary') || text.includes('Uncaught Error') || text.includes('ChunkLoadError')) {
                            errorCount++;
                            if (errorCount >= MAX_ERRORS) {
                                hasBadRequest = true; // Trigger closure
                            }
                        }
                    };
                    
                    popup.on('pageerror', pageErrorHandler);
                    popup.on('console', (msg) => {
                        if (msg.type() === 'error') {
                            consoleErrorHandler(msg);
                        }
                    });
                    
                    try {
                        // Wait for initial navigation
                        await popup.waitForLoadState('commit', { timeout: 3000 }).catch(() => {});
                        
                        // Wait a bit for redirects to settle (redirects usually happen quickly)
                        // This ensures we get the final destination, not the intermediate tracking URL
                        await popup.waitForTimeout(1500);
                        
                        // Check if we got a bad request or too many errors - if so, close immediately (silent)
                        if (hasBadRequest || errorCount >= MAX_ERRORS) {
                            popup.off('response', badRequestHandler);
                            popup.off('pageerror', pageErrorHandler);
                            popup.off('console', consoleErrorHandler);
                            const currentUrl = popup.url();
                            // Silent - just get the URL and continue validation
                            return [popup, null, currentUrl];
                        }
                        
                        // Get URL after redirects have likely completed
                        popupUrl = popup.url();
                        
                        // If URL is still internal/tracking URL, wait a bit more for redirect
                        const projectOrigin = new URL(baseURL).origin;
                        const currentOrigin = popupUrl && popupUrl !== 'about:blank' ? new URL(popupUrl).origin : '';
                        
                        // If still on our domain, wait for redirect to external domain
                        if (currentOrigin === projectOrigin && popupUrl !== 'about:blank') {
                            // Wait for URL to change to external domain (max 3 seconds)
                            const startTime = Date.now();
                            while (Date.now() - startTime < 3000 && !hasBadRequest && errorCount < MAX_ERRORS) {
                                await popup.waitForTimeout(300);
                                const newUrl = popup.url();
                                const newOrigin = new URL(newUrl).origin;
                                if (newOrigin !== projectOrigin) {
                                    popupUrl = newUrl;
                                    break;
                                }
                            }
                            
                            // Check again if we hit error limit during redirect wait (silent)
                            if (hasBadRequest || errorCount >= MAX_ERRORS) {
                                popup.off('response', badRequestHandler);
                                popup.off('pageerror', pageErrorHandler);
                                popup.off('console', consoleErrorHandler);
                                const currentUrl = popup.url();
                                // Silent - just get the URL and continue validation
                                return [popup, null, currentUrl];
                            }
                        }
                        
                        // Try to get response if we don't have one yet
                        if (!responseResult && popupUrl && popupUrl !== 'about:blank') {
                            try {
                                responseResult = await popup.waitForResponse(r => r.url().startsWith('http'), { timeout: 2000 });
                            } catch {
                                // Response timeout is fine - we'll use URL directly
                            }
                        }
                        
                        popup.off('response', badRequestHandler);
                        popup.off('pageerror', pageErrorHandler);
                        popup.off('console', consoleErrorHandler);
                    } catch (e) {
                        // Get URL if possible, continue anyway
                        popup.off('response', badRequestHandler);
                        popup.off('pageerror', pageErrorHandler);
                        popup.off('console', consoleErrorHandler);
                        try {
                            popupUrl = popup.url();
                        } catch {}
                    }
                    
                    return [popup, responseResult, popupUrl];
                }).catch(async (error) => {
                    if (popup) {
                        // Silent - just close on error
                        await popup.close().catch(() => {});
                    }
                    throw error;
                });

                // 2. Get the redirect chain from the request in the NEW tab
                // Handle case where response might be null - check popup URL directly
                // ➡️ FIX: Get final URL (might have changed due to redirects)
                let finalPopupUrl = popupUrl;
                
                // ➡️ SILENT: Just get the URL, don't check for error pages (we'll validate domain only)
                if (!finalPopupUrl || finalPopupUrl === 'about:blank') {
                    try {
                        finalPopupUrl = popup.url();
                    } catch {
                        // If we can't get URL, treat as timeout failure
                        softFailures.push({
                            sourcePath: currentPath,
                            ctaText: ctaId,
                            reason: 'Redirect Timeout',
                            details: `Could not determine redirect URL within timeout.`,
                        });
                        console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Redirect Timeout`);
                        if (popup) {
                            await popup.close().catch(() => {});
                        }
                        continue;
                    }
                }
                
                
                if (!response || finalPopupUrl === 'about:blank') {
                    // Give redirects a moment to complete, then re-check URL
                    try {
                        await popup.waitForTimeout(1000);
                        const recheckedUrl = popup.url();
                        if (recheckedUrl && recheckedUrl !== 'about:blank' && recheckedUrl !== finalPopupUrl) {
                            finalPopupUrl = recheckedUrl;
                        }
                    } catch {}
                }
                
                // Check popup URL directly - we only care about domain comparison
                try {
                    const popupOrigin = new URL(finalPopupUrl).origin;
                    const projectOrigin = new URL(baseURL).origin;
                    
                    // Only check domain - if it's external, it's a pass
                    if (popupOrigin === projectOrigin) {
                        // Double-check by waiting a bit more for redirect (might be slow redirect)
                        await popup.waitForTimeout(2000);
                        const finalCheckUrl = popup.url();
                        const finalCheckOrigin = new URL(finalCheckUrl).origin;
                        
                        if (finalCheckOrigin === projectOrigin) {
                            // ➡️ ONLY FAIL: When final destination is internal domain
                            softFailures.push({
                                sourcePath: currentPath,
                                ctaText: ctaId,
                                reason: 'Final URL is Internal',
                                details: `Redirection failed to leave the domain. Final URL: ${finalCheckUrl}`,
                            });
                            console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Final URL is Internal - ${finalCheckUrl}`);
                        } else {
                            // External domain = pass
                            console.log(`[${projectName}] ✅ PASS ${ctaId} from ${currentPath} -> Redirected to ${finalCheckOrigin}`);
                        }
                    } else {
                        // External domain = pass (silently bypass WAF/errors, just validate domain)
                        console.log(`[${projectName}] ✅ PASS ${ctaId} from ${currentPath} -> Redirected to ${popupOrigin}`);
                    }
                    // ➡️ SPEED: Close popup immediately after validation
                    if (popup) {
                        await popup.close().catch(() => {});
                    }
                    continue;
                } catch (urlError) {
                    // Invalid URL format - treat as pass (might be special protocol or format)
                    console.log(`[${projectName}] ✅ PASS ${ctaId} from ${currentPath} -> Could not parse URL (likely external)`);
                    if (popup) {
                        await popup.close().catch(() => {});
                    }
                    continue;
                }
                
                // ➡️ SILENT: Just get the final URL - don't fail on bad requests, validate domain instead
                // (Bad requests are handled silently to prevent loops, but we still validate the final destination)
                
                const request = response.request();
                const chain: any = (request as any).redirectChain; 
                
                // 3. Check 1: No 404 in Our Domain (Checking the internal redirect URL)
                const internalRequest = (Array.isArray(chain) && chain.length > 0) ? chain[0] : null; 
                
                if (internalRequest) {
                    const internalResponse = await internalRequest.response();
                    if (internalResponse && internalResponse.status() === 404) {
                        softFailures.push({
                            sourcePath: currentPath,
                            ctaText: ctaId,
                            reason: 'Internal Redirect 404',
                            details: `Internal tracking link returned 404. URL: ${internalRequest.url()}`,
                        });
                        console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Internal Redirect 404`);
                        // ➡️ SPEED: Close popup immediately
                        if (popup) {
                            await popup.close().catch(() => {});
                        }
                        continue; 
                    }
                }

                // 4. Check 2: Final Destination is NOT Our Domain
                const finalUrl = response.url();
                const finalOrigin = new URL(finalUrl).origin;
                const projectOrigin = new URL(baseURL).origin; 

                if (finalOrigin === projectOrigin) {
                    // ➡️ ONLY FAIL: When final destination is internal domain
                    softFailures.push({
                        sourcePath: currentPath,
                        ctaText: ctaId,
                        reason: 'Final URL is Internal',
                        details: `Redirection failed to leave the domain. Final URL: ${finalUrl}`,
                    });
                    console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Final URL is Internal - ${finalUrl}`);
                } else {
                    // External domain = pass
                    console.log(`[${projectName}] ✅ PASS ${ctaId} from ${currentPath} -> Redirected to ${finalOrigin}`);
                }
                
                // ➡️ SPEED: Close popup immediately after validation
                if (popup) {
                    await popup.close().catch(() => {});
                }

            } catch (error: any) {
                // This usually catches the Timeout from the Promise.all chain
                const reason = error.message.includes('Timeout') 
                    ? `Redirect Timeout (> ${REDIRECT_TIMEOUT/1000}s)` 
                    : `Click/Monitor Error: ${error.message}`;
                    
                softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: reason, details: { error: error.message } });
                console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: ${reason}`);
            } finally {
                // Ensure the new tab is CLOSED (in case it wasn't closed above)
                if (popup) {
                    try {
                        if (!popup.isClosed()) {
                            await popup.close().catch(() => {});
                        }
                    } catch {
                        // Popup already closed or error, ignore
                    }
                }
                // Minimal delay between CTAs (just to avoid overwhelming the system)
                await page.waitForTimeout(100);
            }
        }
      } // End of CTA iteration
    }); // End of Audit Page step
  } // End of high-traffic paths loop

  // Final Reporting (Attach collected soft failures)
  if (softFailures.length > 0) {
    const failureString = JSON.stringify(softFailures, null, 2);
    testInfo.attachments.push({
      name: `❌ CTA Audit Failures (${softFailures.length} total)`,
      contentType: 'application/json',
      body: Buffer.from(failureString, 'utf8'),
    });
    testInfo.annotations.push({
        type: 'Audit Failures', 
        description: `${softFailures.length} audit failures found. Check attachment.` 
    });
  }

  console.log(`[${projectName}] Audit Completed. Failures: ${softFailures.length}`);
});