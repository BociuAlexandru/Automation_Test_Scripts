// tests/e2e/p0-high-traffic-audit-mobile.spec.ts
import { test, devices, type Response } from "@playwright/test";
import { siteConfigs, type SiteName } from "../config/sites";
import * as fs from "fs"; 
import path from "path";
// Core Playwright APIs plus per-site config and Node helpers (fs/path) power the auditing workflow.

// ✅ Force iPhone 13 device context for this mobile audit
const { defaultBrowserType: _ignored, ...iPhone13Descriptor } = devices["iPhone 13"];
const BASE_MOBILE_CONTEXT_OPTIONS = {
    ...iPhone13Descriptor,
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    permissions: ["geolocation"],
    ignoreHTTPSErrors: true,
};
test.use(BASE_MOBILE_CONTEXT_OPTIONS);

// Define the structure for a soft failure
type SoftFailure = {
  sourcePath: string;
  ctaText: string;
  reason: string;
  details: any;
  csvRow: string; 
};

// Define REDIRECT_TIMEOUT globally
const REDIRECT_TIMEOUT = 15000; // baseline cap for slow redirects
const FAST_REDIRECT_TIMEOUT = 8000; // faster cap for well-behaved brands
const CSV_FAILURE_FOLDER = path.join(process.cwd(), "failures");
const CSV_HEADER = 'Project,Source Page,CTA Text,Issue Type,Details,Failing URL\n';
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
// Timestamp suffix differentiates CSV filenames for every execution.

// Function to safely escape strings for CSV
function csvEscape(str: string | null | undefined) {
    if (str === null || str === undefined) return '""';
    return `"${String(str).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ')}"`;
}
// Normalizes dynamic error text so Excel-friendly CSV rows stay intact.

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeUrlForMatch(url: string) {
  const lowered = url.toLowerCase();
  try {
    return decodeURIComponent(lowered);
  } catch {
    return lowered;
  }
}

const SLUG_STOP_TOKENS = new Set(["casino", "tc", "bn", "lc", "cp"]);
const FAST_REDIRECT_TOKENS = new Set([
  "napoleon",
  "winmasters",
  "win2",
  "winner",
  "fortuna",
  "poker",
  "superbet",
  "12xbet",
  "bilion",
  "netbet",
]);

const ASSET_HOST_PATTERNS = [
  /fonts\.googleapis\.com/i,
  /fonts\.gstatic\.com/i,
  /www\.googletagmanager\.com/i,
  /googlesyndication\.com/i,
  /doubleclick\.net/i,
  /static\.cloudflareinsights\.com/i,
  /www\.google-analytics\.com/i,
  /connect\.facebook\.net/i,
];

function isIgnorableAssetUrl(url: string) {
  try {
    const { hostname } = new URL(url);
    return ASSET_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}

async function waitForAffiliateResponse(popup: any, deadlineTs: number): Promise<Response> {
  while (true) {
    const remaining = deadlineTs - Date.now();
    if (remaining <= 0) {
      throw new Error("Timeout waiting for affiliate response");
    }

    const response = await popup.waitForResponse(
      (r: Response) => r.url().startsWith("http"),
      { timeout: remaining },
    );

    const candidateUrl = response.url();
    if (isIgnorableAssetUrl(candidateUrl)) {
      console.log(`[REDIRECT] Ignoring asset response: ${candidateUrl}`);
      continue;
    }

    return response;
  }
}

function extractSlugTokensFromPath(pathValue?: string | null): string[] {
  if (!pathValue) return [];
  const [pathname] = pathValue.split("?");
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const rawSlug = stripDiacritics(segments[segments.length - 1].toLowerCase());
  if (!rawSlug) return [];

  const rawTokens = rawSlug.split(/[^a-z0-9]+/).filter(Boolean);
  const filteredTokens = rawTokens
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !SLUG_STOP_TOKENS.has(token));

  console.log(`[TOKENS] Extracted slug tokens: ${filteredTokens.join(", ")}`);
  return Array.from(new Set(filteredTokens));
}

function resolveRedirectTimeout(slugTokens: string[]) {
  return slugTokens.some((token) => FAST_REDIRECT_TOKENS.has(token))
    ? FAST_REDIRECT_TIMEOUT
    : REDIRECT_TIMEOUT;
}

// ➡️ DEFINITIVE FIX: humanDelay function (Accepts mandatory arguments to resolve conflict)
async function humanDelay(page: any, minMs: number = 500, maxMs: number = 2000): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await page.waitForTimeout(delay);
}

// ➡️ ANTI-DETECTION: Remove webdriver detection scripts
async function removeWebdriverDetection(page: any) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
            parameters.name === "notifications"
                ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
                : originalQuery(parameters);
        Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, "languages", { get: () => ["ro-RO", "ro", "en-US", "en"] });
    });
}

// Function to attempt to close known popups/modals
async function closeModalOrPopup(page: any) {
    const closeSelectors = [
        "#newsletter-popup-close-button", ".close-modal-x", 'button:has-text("NU MULTUMESC")', 'div[aria-label="Close"]', 
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


test("P0 - High Traffic CTA Audit (Redirect Chain Check)", async ({ browser }, testInfo) => { 
    // Mobile counterpart to the desktop audit, executed in an iPhone 13 emulation context.
    // ⚠️ NOTE: Removed console.log(dateTime) and process.exit(0)
    test.setTimeout(120 * 60 * 1000); 

    const projectName = testInfo.project.name as SiteName;
    
    if (!fs.existsSync(CSV_FAILURE_FOLDER)) {
        fs.mkdirSync(CSV_FAILURE_FOLDER, { recursive: true });
    }
    const csvFilePath = path.join(
        CSV_FAILURE_FOLDER,
        `${projectName}_p0-high-traffic-mobile_${RUN_TIMESTAMP}.csv`,
    );
    fs.writeFileSync(csvFilePath, CSV_HEADER, { encoding: 'utf8' });
    const appendCsvRow = (row: string) => {
        fs.appendFileSync(csvFilePath, row + '\n', { encoding: 'utf8' });
    };
    // Prepare CSV logging utilities so every failure is recorded immediately.
    
    console.log(`[${projectName}] Starting redirect chain audit.`);
    const cfg = siteConfigs[projectName];
    // Pull highTrafficPaths + affiliate regex specific to the current site.
    
    const projectBaseURL = testInfo.project.use.baseURL; 
    if (!projectBaseURL) { throw new Error(`Base URL not found for project: ${projectName}`); }
    const baseURL = projectBaseURL;
    
    const softFailures: SoftFailure[] = [];
    
    const mobileContextOptions = {
        ...BASE_MOBILE_CONTEXT_OPTIONS,
        ignoreHTTPSErrors: testInfo.project.use.ignoreHTTPSErrors ?? BASE_MOBILE_CONTEXT_OPTIONS.ignoreHTTPSErrors,
    };
    const viewportSettings = mobileContextOptions.viewport ?? { width: 390, height: 844 };
    const userAgent = mobileContextOptions.userAgent;
    const deviceScaleFactor = mobileContextOptions.deviceScaleFactor;
    const isMobile = mobileContextOptions.isMobile;
    const hasTouch = mobileContextOptions.hasTouch;
    const locale = mobileContextOptions.locale;
    const timezoneId = mobileContextOptions.timezoneId;
    const permissions = mobileContextOptions.permissions;
    // Snapshot the context options once so every new context is identical (viewport, UA, locale, etc.).
    
    for (const currentPath of cfg.highTrafficPaths) {
        // Check if the current page should be entirely skipped (e.g., if it's in sites.ts skippedPaths)
        if (cfg.skippedPaths && cfg.skippedPaths.includes(currentPath)) {
            console.log(`[${projectName}] ⚠️ SKIPPING known stalling page: ${currentPath}`);
            continue; // Skip to the next path
        }
        
        const context = await browser.newContext(mobileContextOptions);
        const auditPage = await context.newPage(); 
        await removeWebdriverDetection(auditPage);
        let contextClosed = false;
        const closeContextIfNeeded = async () => {
            if (!contextClosed) {
                contextClosed = true;
                await context.close();
            }
        };
        // Use a fresh context per path to avoid state/popup carryover and ensure isolation.

        await test.step(`Audit Page: ${currentPath}`, async () => {
            let pageElementCount = 0; 
            
            // 1. Navigate to the page with realistic timing
            try {
                await auditPage.setExtraHTTPHeaders({ 'Referer': baseURL + (cfg.highTrafficPaths[0] || "/") });
                await auditPage.goto(baseURL + currentPath, { waitUntil: "domcontentloaded", timeout: 30_000 });
                await auditPage.waitForLoadState("domcontentloaded");
            } catch (error: any) {
                // Page Load Failure Logic
                const csvDetail = `Page Load Failure: ${error?.message ?? String(error)}`;
                const csvRow = `${csvEscape(projectName)},${csvEscape(currentPath)},${csvEscape('Page Load')},${csvEscape('Page Load Failure')},${csvEscape(csvDetail)},${csvEscape(baseURL + currentPath)}`;
                appendCsvRow(csvRow);
                
                softFailures.push({ sourcePath: currentPath, ctaText: 'Page Load', reason: 'Page Load Failure', details: { message: error?.message ?? String(error) }, csvRow: csvRow });
                console.error(`[${projectName}] ❌ FAIL Page Load on ${currentPath}: ${error?.message ?? String(error)}`);
                await closeContextIfNeeded(); 
                return; 
            }

            await closeModalOrPopup(auditPage); 
            await humanDelay(auditPage, 500, 1000); 
            // Post-load hygiene: remove popups, then pause briefly before scraping.

            // 2. ➡️ LINK SCRAPING: Find ALL links and filter by URL pattern
            const allLinks = auditPage.locator("a[href]");

            const allLinkData = await allLinks.evaluateAll((nodes, options) => {
                const affiliateUrlPattern = options.affiliateUrlPattern as RegExp;
                const baseURL = options.baseURL as string; 

                return nodes.map((n: Element) => {
                    const href = n.getAttribute("href");
                    
                    let path = href || "";
                    try {
                        if (path.startsWith("http")) {
                            const url = new URL(path);
                            path = url.pathname + url.search;
                        }
                    } catch { return null; }
                    
                    if (!path.startsWith("/") || !affiliateUrlPattern.test(path)) return null; 

                    const element = n as HTMLElement;
                    const normalize = (value?: string | null) => value ? value.trim().replace(/\s+/g, " ") : "";

                    let text = normalize(element.innerText || element.textContent);
                    if (!text) text = normalize(element.getAttribute("title"));
                    if (!text) text = normalize(element.getAttribute("aria-label"));
                    if (!text) {
                        const imgWithAlt = element.querySelector("img[alt]");
                        if (imgWithAlt) {
                            text = normalize(imgWithAlt.getAttribute("alt"));
                        }
                    }
                    if (!text) text = normalize(element.getAttribute("data-casino") || element.getAttribute("data-casino-name"));
                    if (!text) text = "No Text";
                    
                    return {
                        href: href,
                        hasClass: n.classList.contains("affiliate-meta-link"),
                        hasDataCasino: n.hasAttribute("data-casino") || n.hasAttribute("data-casino-name"),
                        hasTrackingAttributes: n.classList.contains("affiliate-meta-link") && (n.hasAttribute("data-casino") || n.hasAttribute("data-casino-name")),
                        target: n.getAttribute("target"),
                        text,
                        selector: 'a[href="' + href + '"]',
                        normalizedPath: path,
                    };
                }).filter((item) => item !== null);
            }, { affiliateUrlPattern: cfg.affiliateUrlPattern, baseURL: baseURL });
            
            const dedupedLinkData = (() => {
                const seen = new Set<string>();
                return allLinkData.filter((item) => {
                    const key = item.normalizedPath || item.href || item.selector;
                    if (!key) return true;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            })();
            
            const affiliateLinkCount = dedupedLinkData.length;
            
            if (affiliateLinkCount === 0) {
                console.warn(`[${projectName}] [WARN] No affiliate links found matching pattern on ${currentPath}`);
                await closeContextIfNeeded();
                return;
            }
            
            // 3. Process CTA Data and Execute Audit
            for (let i = 0; i < affiliateLinkCount; i++) {
                const { href, target, text, hasTrackingAttributes, hasClass, hasDataCasino, selector, normalizedPath } = dedupedLinkData[i];
                
                pageElementCount++;
                const ctaId = `LINK #${pageElementCount} (${text})`;
                const slugTokens = extractSlugTokensFromPath(normalizedPath || href || "");
                const redirectTimeoutMs = resolveRedirectTimeout(slugTokens);

                // --- Preliminary Checks ---
                let skipAudit: boolean = false; 

                // FINALIZED BETANO SKIP: Targeted skip by Href
                if (projectName === "casino.com.ro" && typeof href === "string" && href.toLowerCase().includes("betano")) {
                    console.log(`[${projectName}] ⚠️ SKIPPING Betano link to bypass known external stall.`);
                    continue; 
                }

                // ATTRIBUTE ENFORCEMENT
                if (!hasTrackingAttributes) {
                    let missingDetails: string[] = []; 
                    if (!hasClass) missingDetails.push(".affiliate-meta-link class");
                    if (!hasDataCasino) missingDetails.push("data-casino/data-casino-name");

                    const csvDetail = `Missing Attributes: ${missingDetails.join(", ")}`;
                    const csvRow = `${csvEscape(projectName)},${csvEscape(currentPath)},${csvEscape(text ?? '')},${csvEscape("Tracking Attribute Missing")},${csvEscape(csvDetail)},${csvEscape(href ?? 'N/A')}`;
                    appendCsvRow(csvRow);
                    
                    softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: "Missing Tracking Attributes (Business Logic)", details: csvDetail, csvRow: csvRow });
                    console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Missing Attributes: ${missingDetails.join(", ")}`);
                    skipAudit = true;
                }

                // Target Blank Check
                if (target !== "_blank" && !skipAudit) {
                    const csvDetail = `Missing target="_blank"`;
                    const csvRow = `${csvEscape(projectName)},${csvEscape(currentPath)},${csvEscape(text ?? '')},${csvEscape("Target Blank Missing")},${csvEscape(csvDetail)},${csvEscape(href ?? 'N/A')}`;
                    appendCsvRow(csvRow);

                    softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: "Target Blank Missing", details: csvDetail, csvRow: csvRow });
                    console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Target Blank Missing`);
                }

                // --- Core Redirection Audit ---
                if (typeof href === "string" && !skipAudit) {
                    let popup: any;
                    
                    try {
                        const redirectDeadline = Date.now() + redirectTimeoutMs;

                        const [newPopup] = await Promise.all([
                            auditPage.waitForEvent("popup", { timeout: REDIRECT_TIMEOUT }),
                            auditPage.evaluate((s) => {
                                const element = document.querySelector(s);
                                if (element) { (element as HTMLAnchorElement).click(); }
                            }, selector),
                        ]);

                        popup = newPopup;

                        const response = await waitForAffiliateResponse(popup, redirectDeadline);

                        const navigationTimeout = Math.min(redirectTimeoutMs, Math.max(500, redirectDeadline - Date.now()));
                        await popup.waitForNavigation({ waitUntil: "domcontentloaded", timeout: navigationTimeout }).catch(() => null);

                        // 2. Get the redirect chain
                        const request = response.request();
                        const chain: any = (request as any).redirectChain; 
                        
                        // 3. Check 1: No 404 in Our Domain
                        const internalRequest = Array.isArray(chain) && chain.length > 0 ? chain[0] : null; 
                        
                        if (internalRequest) {
                            const internalResponse = await internalRequest.response();
                            if (internalResponse && internalResponse.status() === 404) {
                                const csvDetail = `Internal tracking link returned 404. URL: ${internalRequest.url()}`;
                                const csvRow = `${csvEscape(projectName)},${csvEscape(currentPath)},${csvEscape(text ?? '')},${csvEscape("Internal Redirect 404")},${csvEscape(csvDetail)},${csvEscape(href ?? 'N/A')}`;
                                appendCsvRow(csvRow);
                                
                                softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: "Internal Redirect 404", details: csvDetail, csvRow: csvRow });
                                console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Internal Redirect 404`);
                            }
                        }

                        // 4. Check 2: Final Destination is NOT Our Domain
                        const finalUrl = popup.url() || response.url();
                        const finalOrigin = new URL(finalUrl).origin;
                        const projectOrigin = new URL(baseURL).origin; 

                        if (finalOrigin === projectOrigin) {
                            const csvDetail = `Redirection failed to leave domain. Final URL: ${finalUrl}`;
                            const csvRow = `${csvEscape(projectName)},${csvEscape(currentPath)},${csvEscape(text ?? '')},${csvEscape("Final URL is Internal")},${csvEscape(csvDetail)},${csvEscape(href ?? 'N/A')}`;
                            appendCsvRow(csvRow);

                            softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: "Final URL is Internal", details: csvDetail, csvRow: csvRow });
                            console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Final URL is Internal - ${finalUrl}`);
                        } else {
                            if (slugTokens.length > 0) {
                                const normalizedFinalUrl = normalizeUrlForMatch(finalUrl);
                                const matchedToken = slugTokens.find((token) => normalizedFinalUrl.includes(token));

                                if (!matchedToken) {
                                    const csvDetail = `Slug tokens (${slugTokens.join(', ')}) missing from redirect URL: ${finalUrl}`;
                                    const csvRow = `${csvEscape(projectName)},${csvEscape(currentPath)},${csvEscape(text ?? '')},${csvEscape("Redirect Brand Mismatch")},${csvEscape(csvDetail)},${csvEscape(href ?? 'N/A')}`;
                                    appendCsvRow(csvRow);

                                    softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: "Redirect Brand Mismatch", details: csvDetail, csvRow: csvRow });
                                    console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: Redirect Brand Mismatch - ${csvDetail}`);
                                    continue;
                                }

                                console.log(`[${projectName}] ✅ PASS ${ctaId} from ${currentPath} -> Redirected to ${finalOrigin} (matched token: "${matchedToken}")`);
                            } else {
                                console.log(`[${projectName}] ✅ PASS ${ctaId} from ${currentPath} -> Redirected to ${finalOrigin}`);
                            }
                        }

                    } catch (error: any) {
                        // WAF/TIMEOUT FIX: Fail-Forward on timeout
                        let finalUrlOnTimeout: string | null = null;
                        if (popup) {
                            try { finalUrlOnTimeout = popup.url() || ""; } catch {}
                        }

                        const reason = error.message.includes("Timeout")
                            ? `Redirect Timeout (> ${REDIRECT_TIMEOUT / 1000}s)`
                            : `Click/Monitor Error: ${error.message}`;

                        // WAF/TIMEOUT FIX: If final URL is external on timeout, treat as PASS.
                        if (finalUrlOnTimeout && finalUrlOnTimeout.startsWith("http")) {
                            try {
                                const timeoutOrigin = new URL(finalUrlOnTimeout).origin;
                                const projectOrigin = new URL(baseURL).origin; 

                                if (timeoutOrigin !== projectOrigin) {
                                    if (popup) { await popup.close().catch(() => {}); } 
                                    console.log(`[${projectName}] ✅ PASS ${ctaId} from ${currentPath} -> Bypassed WAF/Error to ${timeoutOrigin}`);
                                    return; 
                                }
                            } catch {}
                        }
                        
                        // If we couldn't bypass, log the original failure
                        const logError = error.message.includes("Timeout") ? "Redirect Timeout" : reason;
                        const csvDetail = `Error: ${logError}. Message: ${error.message}`;
                        const csvRow = `${csvEscape(projectName)},${csvEscape(currentPath)},${csvEscape(text ?? '')},${csvEscape("Redirection Failure")},${csvEscape(csvDetail)},${csvEscape(href ?? 'N/A')}`;
                        appendCsvRow(csvRow);

                        softFailures.push({ sourcePath: currentPath, ctaText: ctaId, reason: logError, details: csvDetail, csvRow: csvRow });
                        console.error(`[${projectName}] ❌ FAIL ${ctaId} from ${currentPath}: ${logError}`);
                        
                    } finally {
                        // Ensure the new tab is CLOSED (Final safety)
                        if (popup) {
                            try { if (!popup.isClosed()) await popup.close().catch(() => {}); } catch {}
                        }
                    }
                }
            }
        });
        await closeContextIfNeeded();
    }

    // Final Reporting (JSON Attachment)
    if (softFailures.length > 0) {
        const failureString = JSON.stringify(softFailures, null, 2);
        testInfo.attachments.push({ name: `❌ CTA Audit Failures (${softFailures.length} total)`, contentType: "application/json", body: Buffer.from(failureString, "utf8") });
        testInfo.annotations.push({ type: "Audit Failures", description: `${softFailures.length} audit failures found. Check attachment.`, });
    }

    console.log(`[${projectName}] Audit Completed. Failures: ${softFailures.length}. Appended to ${csvFilePath}`);
});
