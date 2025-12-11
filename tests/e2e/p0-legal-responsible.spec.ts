// tests/e2e/p0-legal-responsible.spec.ts (Final Clean Code)

// -------------------------------------------------------------------------
// 🚀 SECTION 1: IMPORTS AND CONFIGURATION
// This block sets up the necessary tools and constants required by the script.
// -------------------------------------------------------------------------

// 💥 CRITICAL IMPORTS
// Playwright's core testing functions and TypeScript types.
import { test, expect, type TestInfo, type Page } from '@playwright/test'; 
// Node.js modules for file system (fs) and path manipulation, used for CSV logging.
import * as fs from "fs"; 
import path from "path"; 
// Configuration for the target sites.
import { siteConfigs, SiteName } from './config/sites'; 

/**
 * Helper to get the siteName from the Playwright Project Name.
 * This ensures we are always using the correct, defined name for logging and lookups.
 */
const getSiteNameFromProject = (projectName: string): SiteName => {
    return projectName as SiteName;
};

// --- GLOBAL STATE CONFIGURATION (CHECKPOINTING) ---
// This section is part of the original project structure but is currently unused
// by the legal checks. It defines how to save/read state between test runs.
const STATE_FILE = path.join(process.cwd(), 'project_resume_state.json');
type ResumeState = Record<SiteName, string[]>; 

function readState(): ResumeState {
    // ... (Code to read previous state from a JSON file)
    return { /* ... */ } as ResumeState; 
}

function writeState(state: ResumeState) {
    // ... (Code to write current state to a JSON file)
}

// --- CSV CONFIGURATION ---
// Defines where the failure report is stored and the column headers for the CSV file.
const BASE_REPORT_DIR = path.join(process.cwd(), 'artifact-history');
const CSV_FAILURE_FILE = path.join(BASE_REPORT_DIR, 'legal_responsible_failures.csv');
const CSV_HEADER = 'Project,Test ID,Failure Type,Details,Failing URL\n';

// -------------------------------------------------------------------------
// 🛠️ SECTION 2: CORE UTILITY FUNCTIONS
// These functions handle file manipulation, data formatting, and link validation.
// -------------------------------------------------------------------------

/**
 * Ensures text output is safe for CSV format by wrapping it in quotes and escaping inner quotes.
 */
function csvEscape(str: string | null | undefined): string {
    if (str === null || str === undefined) return '""';
    return `"${String(str).replace(/"/g, '""').replace(/(\r\n|\n|\r)/gm, ' ')}"`;
}

/**
 * Appends a detailed failure record to the shared CSV report file.
 * This function handles creating the file/directory if it doesn't exist.
 */
function logFailureToCsv(projectName: string, testId: string, type: string, details: string, url: string) {
    const csvRow = `${csvEscape(projectName)},${csvEscape(testId)},${csvEscape(type)},${csvEscape(details)},${csvEscape(url)}`;
    
    if (!fs.existsSync(BASE_REPORT_DIR)) {
        fs.mkdirSync(BASE_REPORT_DIR, { recursive: true });
    }
    
    fs.appendFileSync(CSV_FAILURE_FILE, csvRow + '\n', { encoding: 'utf8' });
}

/**
 * CORE LINK VALIDATION FUNCTION.
 * Navigates to the specified URL to check its HTTP status code.
 * @returns true if status is 200-399 (Success/Redirect), false otherwise.
 */
async function checkLinkStatus(page: Page, url: string, linkText: string, projectName: string, testId: string): Promise<boolean> {
    let statusCode = 0;
    try {
        const response = await page.goto(url, { waitUntil: 'load', timeout: 30000 }); 
        statusCode = response?.status() || 0;
        
        if (statusCode >= 200 && statusCode < 400) {
            // Success log for console output
            console.log(`[${projectName}] ✅ PASSED: Link "${linkText}" redirected successfully (Status: ${statusCode}). URL: ${url}`);
            return true;
        } else {
            // Failure logic: log to CSV and console
            const errorMsg = `Link failed with status code: ${statusCode}.`;
            logFailureToCsv(projectName, testId, 'Link Status Failure', errorMsg, url);
            console.error(`[${projectName}] ❌ FAILED: Link "${linkText}" failed status validation (Status: ${statusCode}). URL: ${url}`);
            return false;
        }
    } catch (error) {
        // Catch navigation failures (timeouts, crashes, network errors)
        const errorDetails = error instanceof Error ? error.message.split('\n')[0] : 'Unknown navigation error.';
        logFailureToCsv(projectName, testId, 'Navigation/Crash Fail', errorDetails, url);
        console.error(`[${projectName}] ❌ FAILED: Link "${linkText}" crashed or timed out. Error: ${errorDetails}. URL: ${url}`);
        return false;
    } finally {
        // CRITICAL: Always navigate back to the homepage to prepare for the next link check
        const baseURL = (page as any).context()._options.baseURL || '/';
        await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 }).catch(e => {
            console.warn(`[${projectName}] WARNING: Failed to recover to homepage after link check.`);
        });
    }
}

// Global array to accumulate "soft failures" (issues that shouldn't stop the test instantly)
let softFailuresAcc: string[] = []; 

// List of all known project hosts used for dynamic link correction.
const INTERNAL_HOSTS = [
    'casino.com.ro', 'supercazino', 'jocsloturi', 
    'jocuricazinouri', 'jocpacanele', 'beturi'
].map(name => name.replace(/^www\./, ''));


// -------------------------------------------------------------------------
// ⚙️ SECTION 3: TEST EXECUTION LOGIC (runComplianceChecks)
// This function contains the actual steps and checks executed for ONE single project.
// -------------------------------------------------------------------------

/**
 * Defines and runs all compliance checks for a single project (H8/B7 merged logic).
 * This function is run 6 times, once for each project worker.
 */
async function runComplianceChecks(page: Page, testInfo: TestInfo) {

    // Retrieve dynamic project info (site name, base URL) from Playwright's context
    const siteName = getSiteNameFromProject(testInfo.project.name);
    const baseURL = testInfo.project.use.baseURL!; 
    const currentHost = new URL(baseURL).host.replace(/^www\./, '');
    
    // Safety measure: Clears any lingering soft failures from other parallel tests (workers)
    softFailuresAcc = softFailuresAcc.filter(s => !s.includes(`[${siteName}]`));

    console.log(`\n[${siteName}] === Starting Legal Compliance Checks (Current Host: ${currentHost}) ===`); 
    
    // --- Step 1: Initial Load and Footer Scroll ---
    await test.step('B7.1/H8.1: Load Page and Scroll to Footer', async () => {
        await page.goto(baseURL, { waitUntil: 'load' });
        // Scroll down to ensure footer links are loaded/visible
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000); 
    });

    // --- Step 2: Validate Critical Legal Links (H8.2) ---
    // This array defines the 6 critical links and their necessary URL keywords for locating them.
    const legalLinks = [
        { name: "Licență / Autorizare", selector: 'a[href*="licenta"]', testId: 'H8.2-License' },
        
        // Includes keywords for Responsible Gaming and Interzis Minorilor links
        { 
            name: "Joc Responsabil Link", 
            selector: 'a[href*="joc-de-noroc-responsabil"], a[href*="joc-responsabil"], a[href*="interzis-minorilor"]', 
            testId: 'H8.2-ResponsibleLink' 
        },

        // Locates ONJN link by domain or by text content
        { 
            name: "ONJN Link", 
            selector: 'a[href*="onjn.gov.ro"], a:has-text("ONJN"), a:has-text("Guvern")', 
            testId: 'H8.2-ONJNLink' 
        },
        
        // Includes keywords for Termeni și Condiții
        { 
            name: "Termeni & Condiții", 
            selector: 'a[href*="termeni-si-conditii"], a[href*="termeni-conditii"]', 
            testId: 'H8.2-TOC' 
        },
        
        // Includes keywords for various Declaratie/Politica de Confidentialitate links
        { 
            name: "Declarație Confidențialitate", 
            selector: 'a[href*="privacy-statement-eu"], a[href*="declaratie-de-confidentialitate-ue"], a[href*="politica-de-confidentialitate"]', 
            testId: 'H8.2-Privacy' 
        },
        
        // Includes keywords for Cookie Policy links
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
            
            // Checks if the link element can be located at all
            if (linkCount === 0) {
                logFailureToCsv(siteName, link.testId, 'Link Visibility/Existence', `No link found with href or text matching keywords: ${link.selector}.`, baseURL);
                console.error(`[${siteName}] ❌ FAILED: Legal link "${link.name}" not found via definitive HREF/Text selector.`);
                softFailuresAcc.push(`[${siteName}] ${link.testId}: Link existence failed for "${link.name}".`);
                return;
            }

            let successfulCheck = false;

            // Iterates through all found link candidates for this topic
            for (let i = 0; i < linkCount; i++) {
                const currentLink = linkLocator.nth(i);
                let linkHref = await currentLink.getAttribute('href') || '';
                const linkText = await currentLink.innerText() || link.name;
                
                if (linkHref && linkHref !== '#' && !linkHref.includes(baseURL + '/#')) {
                    
                    let targetUrl = linkHref;
                    
                    // Logic to correct links that point to other internal domains
                    if (linkHref.startsWith('http')) {
                        const linkUrl = new URL(linkHref);
                        const linkHost = linkUrl.host.replace(/^www\./, '');
                        
                        if (INTERNAL_HOSTS.includes(linkHost) && linkHost !== currentHost) {
                            console.warn(`[${siteName}] WARNING: Correcting hardcoded link from ${linkHost} to ${currentHost}`);
                            // Rewrites the domain to the current project's domain
                            const correctUrl = new URL(baseURL);
                            correctUrl.pathname = linkUrl.pathname;
                            correctUrl.search = linkUrl.search;
                            targetUrl = correctUrl.toString();
                        } else if (!linkHref.includes(currentHost) && linkHost.includes('.')) {
                             // Skips truly external links, unless it's the specific ONJN link
                             if (!linkHref.includes('onjn.gov.ro')) {
                                continue;
                             }
                        }
                    } else if (linkHref.startsWith('/')) {
                        targetUrl = baseURL + linkHref; // Corrects relative path
                    }

                    // Perform the HTTP status check (calls the function in Section 2)
                    const isStatusOk = await checkLinkStatus(page, targetUrl, linkText.trim(), siteName, `${link.testId}-${i}`);

                    if (isStatusOk) {
                        successfulCheck = true;
                        break; // Stop checking this topic once a valid link is found
                    }
                }
            }

            // If no functional link was found after checking all candidates, record a soft failure
            if (!successfulCheck) {
                logFailureToCsv(siteName, link.testId, 'Link Status Final Failure', `No functional link found/validated after checking ${linkCount} candidates.`, baseURL);
                softFailuresAcc.push(`[${siteName}] ${link.testId}: No functional link found for "${link.name}".`);
            }
        });
    }

    // Recover page state by navigating back to the homepage
    await page.goto(baseURL, { waitUntil: 'load', timeout: 10000 }); 
}


// -------------------------------------------------------------------------
// 🏁 SECTION 4: TEST RUNNER DEFINITION
// This section tells Playwright how and when to run the checks.
// -------------------------------------------------------------------------

// Defines the main test suite container.
test.describe('P0 Legal and Responsible Gaming Compliance', () => {

    // Runs once before any project starts, ensuring the CSV report file is clean.
    test.beforeAll(() => {
        if (!fs.existsSync(BASE_REPORT_DIR)) {
            fs.mkdirSync(BASE_REPORT_DIR, { recursive: true });
        }
        // Overwrites the CSV file with the header for a clean start
        fs.writeFileSync(CSV_FAILURE_FILE, CSV_HEADER, { encoding: 'utf8' });
        console.log(`[CSV] Initialized Legal Compliance Report: ${CSV_FAILURE_FILE}`);
    });

    // CRITICAL FIX: Defines ONE test block. Playwright automatically runs this block 
    // 6 times, once for each project defined in playwright.config.ts, yielding 6 total tests.
    test(`H8/B7: Compliance and Legal Link Validation`, async ({ page, request }, testInfo: TestInfo) => {
        
        // Execute the main audit logic
        await runComplianceChecks(page, testInfo); 
        
        testInfo.annotations.push({ type: 'Test ID', description: 'H8/B7' });

        // Final assertion: Determines the overall test status (Pass/Fail)
        const siteName = getSiteNameFromProject(testInfo.project.name);
        const projectFailures = softFailuresAcc.filter(s => s.includes(`[${siteName}]`));
        
        // Clean up: Remove current project failures from the global accumulator
        softFailuresAcc = softFailuresAcc.filter(s => !s.includes(`[${siteName}]`));
        
        // If ANY soft failure was recorded (meaning a link was not found or failed status check)
        if (projectFailures.length > 0) {
            // Throw an error to explicitly mark the test as FAIL
            throw new Error(`Compliance checks completed with ${projectFailures.length} soft failures for ${siteName}. Check CSV for details.`);
        }
        // If no error is thrown, the test is automatically marked as PASS.
    });
});