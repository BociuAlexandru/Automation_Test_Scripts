// tests/e2e/p0-legal-responsible.spec.ts (Final Clean Code)

// 💥 CRITICAL IMPORTS
import { test, expect, type TestInfo, type Page } from '@playwright/test'; 
import * as fs from "fs"; 
import path from "path"; 
import { siteConfigs, SiteName } from './config/sites'; 

/**
 * Helper to get the siteName from the Playwright Project Name.
 */
const getSiteNameFromProject = (projectName: string): SiteName => {
    return projectName as SiteName;
};

// --- GLOBAL STATE CONFIGURATION (CHECKPOINTING) ---
const STATE_FILE = path.join(process.cwd(), 'project_resume_state.json');
type ResumeState = Record<SiteName, string[]>; 

function readState(): ResumeState {
    const defaultState: ResumeState = {
        'beturi': [], 'casino.com.ro': [], 'jocpacanele': [], 
        'jocsloturi': [], 'supercazino': [], 'jocuricazinouri': [],
    } as ResumeState; 

    if (!fs.existsSync(STATE_FILE)) {
        return defaultState;
    }
    try {
        const data = fs.readFileSync(STATE_FILE, 'utf-8');
        const state = JSON.parse(data);
        return { ...defaultState, ...state };
    } catch (e) {
        return defaultState;
    }
}

function writeState(state: ResumeState) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
        // Logging is omitted here for the simple function body
    }
}

// --- CSV CONFIGURATION ---
const BASE_REPORT_DIR = path.join(process.cwd(), 'artifact-history');
const CSV_FAILURE_FILE = path.join(BASE_REPORT_DIR, 'legal_responsible_failures.csv');
const CSV_HEADER = 'Project,Test ID,Failure Type,Details,Failing URL\n';

// --- CORE UTILITY FUNCTIONS ---
function csvEscape(str: string | null | undefined): string {
    if (str === null || str === undefined) return '""';
    return `"${String(str).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ')}"`;
}

function logFailureToCsv(projectName: string, testId: string, type: string, details: string, url: string) {
    const csvRow = `${csvEscape(projectName)},${csvEscape(testId)},${csvEscape(type)},${csvEscape(details)},${csvEscape(url)}`;
    
    if (!fs.existsSync(BASE_REPORT_DIR)) {
        fs.mkdirSync(BASE_REPORT_DIR, { recursive: true });
    }
    
    fs.appendFileSync(CSV_FAILURE_FILE, csvRow + '\n', { encoding: 'utf8' });
}

/**
 * Validates the status code of a navigation response, logging errors if encountered.
 * @returns true if status is 2xx or 3xx (success/redirect), false otherwise.
 */
async function checkLinkStatus(page: Page, url: string, linkText: string, projectName: string, testId: string): Promise<boolean> {
    let statusCode = 0;
    try {
        const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 }); 
        statusCode = response?.status() || 0;
        
        if (statusCode >= 200 && statusCode < 400) {
            console.log(`[${projectName}] ✅ PASSED: Link "${linkText}" redirected successfully (Status: ${statusCode}). URL: ${url}`);
            return true;
        } else {
            const errorMsg = `Link failed with status code: ${statusCode}.`;
            logFailureToCsv(projectName, testId, 'Link Status Failure', errorMsg, url);
            console.error(`[${projectName}] ❌ FAILED: Link "${linkText}" failed status validation (Status: ${statusCode}). URL: ${url}`);
            return false;
        }
    } catch (error) {
        const errorDetails = error instanceof Error ? error.message.split('\n')[0] : 'Unknown navigation error.';
        logFailureToCsv(projectName, testId, 'Navigation/Crash Fail', errorDetails, url);
        console.error(`[${projectName}] ❌ FAILED: Link "${linkText}" crashed or timed out. Error: ${errorDetails}. URL: ${url}`);
        return false;
    } finally {
        // Recover to the homepage of the current project's base URL
        const baseURL = (page as any).context()._options.baseURL || '/';
        await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 }).catch(e => {
            console.warn(`[${projectName}] WARNING: Failed to recover to homepage after link check.`);
        });
    }
}

// Global soft failure accumulator (must be tracked outside of test functions)
let softFailuresAcc: string[] = []; 

// List of internal domains used for correction. 
const INTERNAL_HOSTS = [
    'casino.com.ro', 'supercazino', 'jocsloturi', 
    'jocuricazinouri', 'jocpacanele', 'beturi'
].map(name => name.replace(/^www\./, ''));


/**
 * Defines and runs all compliance checks for a single project.
 */
async function runComplianceChecks(page: Page, testInfo: TestInfo) {

    const siteName = getSiteNameFromProject(testInfo.project.name);
    const baseURL = testInfo.project.use.baseURL!; 
    const currentHost = new URL(baseURL).host.replace(/^www\./, '');
    
    // Clear soft failures for the *current* project worker before starting
    softFailuresAcc = softFailuresAcc.filter(s => !s.includes(`[${siteName}]`));

    console.log(`\n[${siteName}] === Starting Legal Compliance Checks (Current Host: ${currentHost}) ===`); 
    
    // --- Step 1: Initial Load and Footer Scroll ---
    await test.step('B7.1/H8.1: Load Page and Scroll to Footer', async () => {
        await page.goto(baseURL, { waitUntil: 'load' });
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000); 
    });

    // --- Step 2: Validate Critical Legal Links (H8.2) ---
    // Final, most comprehensive selector set based on all known URL keywords.
    const legalLinks = [
        { name: "Licență / Autorizare", selector: 'a[href*="licenta"]', testId: 'H8.2-License' },
        
        // FIX: Added 'interzis-minorilor' and kept both original keywords
        { 
            name: "Joc Responsabil Link", 
            selector: 'a[href*="joc-de-noroc-responsabil"], a[href*="joc-responsabil"], a[href*="interzis-minorilor"]', 
            testId: 'H8.2-ResponsibleLink' 
        },

        // FIX: Use the full domain for ONJN, and make the selector more aggressive with `:has-text` for the element itself
        { 
            name: "ONJN Link", 
            selector: 'a[href*="onjn.gov.ro"], a:has-text("ONJN"), a:has-text("Guvern")', 
            testId: 'H8.2-ONJNLink' 
        },
        
        // FIX: Added 'termeni-conditii'
        { 
            name: "Termeni & Condiții", 
            selector: 'a[href*="termeni-si-conditii"], a[href*="termeni-conditii"]', 
            testId: 'H8.2-TOC' 
        },
        
        // FIX: Added the generic '/politica-de-confidentialitate/' keyword confirmed by the user for jocuricazinouri
        { 
            name: "Declarație Confidențialitate", 
            selector: 'a[href*="privacy-statement-eu"], a[href*="declaratie-de-confidentialitate-ue"], a[href*="politica-de-confidentialitate"]', 
            testId: 'H8.2-Privacy' 
        },
        
        // FIX: Retain all cookie policy keywords
        { 
            name: "Politica Cookie", 
            selector: 'a[href*="cookie-policy-eu"], a[href*="politica-privind-cookie-urile-ue"], a[href*="cookie-policy"]', 
            testId: 'H8.2-Cookie' 
        },
    ];

    for (const link of legalLinks) {
        await test.step(`Validate Link: ${link.name}`, async () => {
            const linkLocator = page.locator(link.selector);
            const linkCount = await linkLocator.count();
            
            if (linkCount === 0) {
                // This is where the soft failure is recorded if the link element is NOT found.
                logFailureToCsv(siteName, link.testId, 'Link Visibility/Existence', `No link found with href or text matching keywords: ${link.selector}.`, baseURL);
                console.error(`[${siteName}] ❌ FAILED: Legal link "${link.name}" not found via definitive HREF/Text selector.`);
                softFailuresAcc.push(`[${siteName}] ${link.testId}: Link existence failed for "${link.name}".`);
                return;
            }

            let successfulCheck = false;

            for (let i = 0; i < linkCount; i++) {
                const currentLink = linkLocator.nth(i);
                let linkHref = await currentLink.getAttribute('href') || '';
                // Use innerText for a cleaner text capture
                const linkText = await currentLink.innerText() || link.name;
                
                if (linkHref && linkHref !== '#' && !linkHref.includes(baseURL + '/#')) {
                    
                    let targetUrl = linkHref;
                    
                    // DYNAMIC DOMAIN CORRECTION
                    if (linkHref.startsWith('http')) {
                        const linkUrl = new URL(linkHref);
                        const linkHost = linkUrl.host.replace(/^www\./, '');
                        
                        if (INTERNAL_HOSTS.includes(linkHost) && linkHost !== currentHost) {
                            console.warn(`[${siteName}] WARNING: Correcting hardcoded link from ${linkHost} to ${currentHost}`);
                            
                            const correctUrl = new URL(baseURL);
                            correctUrl.pathname = linkUrl.pathname;
                            correctUrl.search = linkUrl.search;
                            targetUrl = correctUrl.toString();
                        } else if (!linkHref.includes(currentHost) && linkHost.includes('.')) {
                             // Skip truly external sites other than ONJN
                             if (!linkHref.includes('onjn.gov.ro')) {
                                continue;
                             }
                        }
                    } else if (linkHref.startsWith('/')) {
                        targetUrl = baseURL + linkHref;
                    }

                    // 3. Validate Link Status (Navigates to check status)
                    const isStatusOk = await checkLinkStatus(page, targetUrl, linkText.trim(), siteName, `${link.testId}-${i}`);

                    if (isStatusOk) {
                        successfulCheck = true;
                        break; 
                    }
                }
            }

            if (!successfulCheck) {
                logFailureToCsv(siteName, link.testId, 'Link Status Final Failure', `No functional link found/validated after checking ${linkCount} candidates.`, baseURL);
                softFailuresAcc.push(`[${siteName}] ${link.testId}: No functional link found for "${link.name}".`);
            }
        });
    }

    await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 }); // Final recovery to homepage
}


// --- TEST EXECUTION LOOP (FIXED FOR 6 TESTS) ---
test.describe('P0 Legal and Responsible Gaming Compliance', () => {

    test.beforeAll(() => {
        // Initialize CSV file
        if (!fs.existsSync(BASE_REPORT_DIR)) {
            fs.mkdirSync(BASE_REPORT_DIR, { recursive: true });
        }
        fs.writeFileSync(CSV_FAILURE_FILE, CSV_HEADER, { encoding: 'utf8' });
        console.log(`[CSV] Initialized Legal Compliance Report: ${CSV_FAILURE_FILE}`);
    });

    // CRITICAL FIX: Define ONLY ONE test block.
    test(`H8/B7: Compliance and Legal Link Validation`, async ({ page, request }, testInfo: TestInfo) => {
        
        await runComplianceChecks(page, testInfo); 
        
        testInfo.annotations.push({ type: 'Test ID', description: 'H8/B7' });

        // Final assertion checks only for failures in link checks (softFailuresAcc)
        const siteName = getSiteNameFromProject(testInfo.project.name);
        const projectFailures = softFailuresAcc.filter(s => s.includes(`[${siteName}]`));
        
        // This line is essential to prevent contamination when using shared global state.
        softFailuresAcc = softFailuresAcc.filter(s => !s.includes(`[${siteName}]`));
        
        if (projectFailures.length > 0) {
            throw new Error(`Compliance checks completed with ${projectFailures.length} soft failures for ${siteName}. Check CSV for details.`);
        }
    });
});