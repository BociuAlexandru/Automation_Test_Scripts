// tests/e2e/config/crawler.ts - Reworked for Recursive Sitemap Discovery

import { Page } from '@playwright/test';
import { SiteConfig } from './sites'; 
import { URL } from 'url';
import { default as fetch } from 'node-fetch'; 

type CrawlResult = {
    discoveredUrls: string[];
    skippedUrls: string[];
};

/**
 * Parses XML content (like a sitemap) to extract URLs from <loc> tags.
 * @param xmlString - The XML content from the sitemap.
 * @returns Array of clean paths (relative or full URLs).
 */
function extractUrlsFromXml(xmlString: string): string[] {
    const urlSet = new Set<string>();
    // Regex to find <loc>...</loc> content
    const locRegex = /<loc>(.*?)<\/loc>/gi;
    let match;

    while ((match = locRegex.exec(xmlString)) !== null) {
        urlSet.add(match[1].trim());
    }
    return Array.from(urlSet);
}

/**
 * Recursively fetches sitemaps and extracts all final content URLs.
 * @param url The current sitemap URL to fetch.
 * @param baseURL The base URL of the project.
 * @param visitedSitemaps Set to prevent endless loops.
 * @returns Array of final, normalized relative content paths.
 */
async function fetchAndFilterSitemapUrls(
    url: string,
    baseURL: string,
    visitedSitemaps: Set<string>
): Promise<string[]> {
    if (visitedSitemaps.has(url)) {
        return [];
    }
    visitedSitemaps.add(url);
    
    let contentUrls: string[] = [];

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Playwright Crawler Bot' } 
        });

        if (!response.ok) {
            console.error(`[CRAWLER] Failed to fetch sitemap ${url}: ${response.status}`);
            return [];
        }

        const xmlText = await response.text();
        const urlsInXml = extractUrlsFromXml(xmlText);

        if (urlsInXml.length === 0) {
            return [];
        }

        // Check if the current file is a SITEMAP INDEX (contains links to other .xml files)
        if (urlsInXml[0].toLowerCase().endsWith('.xml')) {
            console.log(`[CRAWLER] Found Sitemap Index at ${url}. Fetching sub-sitemaps...`);
            
            // Recursively fetch all sub-sitemaps
            for (const subSitemapUrl of urlsInXml) {
                if (subSitemapUrl.startsWith(baseURL)) {
                    const subUrls = await fetchAndFilterSitemapUrls(subSitemapUrl, baseURL, visitedSitemaps);
                    contentUrls.push(...subUrls);
                }
            }
        } else {
            // This XML contains final content URLs (does not link to other .xml files)
            contentUrls = urlsInXml;
        }

    } catch (error) {
        console.error(`[CRAWLER] Error processing ${url}: ${error}`);
    }
    
    return contentUrls;
}


/**
 * Sitemap-based site discovery.
 */
export async function crawlSite(
    page: Page,
    baseURL: string,
    config: SiteConfig,
): Promise<CrawlResult> {
    const eligibleUrls: string[] = [];
    const skippedUrls: string[] = [];
    const maxPages = config.maxPages; 
    
    const sitemapUrl = `${baseURL}/sitemap.xml`; 
    
    console.log(`[CRAWLER] Attempting to fetch sitemap from: ${sitemapUrl}`);
    
    const rawContentUrls = await fetchAndFilterSitemapUrls(sitemapUrl, baseURL, new Set<string>());

    console.log(`[CRAWLER] Successfully found ${rawContentUrls.length} links from all sitemaps.`);

    // --- FILTERING AND LIMITING ---
    for (const fullUrl of rawContentUrls) {
        let path = '';

        try {
            // 1. Normalize the full URL to a relative path
            const urlObj = new URL(fullUrl);
            let pathname = urlObj.pathname.replace(/\/$/, '');
            if (pathname === '') pathname = '/';
            path = pathname.split('?')[0];
        } catch (e) {
            // Ignore malformed full URLs
            skippedUrls.push(fullUrl);
            continue;
        }

        // Check 1: Exclude Patterns
        if (config.excludePatterns.some(pattern => pattern.test(path))) {
            skippedUrls.push(path);
            continue;
        }
        
        // Check 2: Include Patterns (MUST match at least one)
        if (!config.includePatterns.some(pattern => pattern.test(path))) {
            skippedUrls.push(path); 
            continue;
        }
        
        eligibleUrls.push(path);
    }

    // Deduplicate before sampling
    const uniqueEligibleUrls = Array.from(new Set(eligibleUrls));

    // Fisher-Yates shuffle to randomize selection deterministically per run
    for (let i = uniqueEligibleUrls.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [uniqueEligibleUrls[i], uniqueEligibleUrls[j]] = [uniqueEligibleUrls[j], uniqueEligibleUrls[i]];
    }

    const discoveredUrls = uniqueEligibleUrls.slice(0, maxPages);

    console.log(`[CRAWLER] Final URLs selected for audit: ${discoveredUrls.length}`);

    // Fallback if no URLs were found (e.g., sitemap index was empty or fatal error)
    if (discoveredUrls.length === 0) {
        console.log('[CRAWLER] WARNING: No URLs found via sitemap. Auditing homepage as fallback.');
        discoveredUrls.push(...config.startPaths.slice(0, 1));
    }

    // Ensure the array is unique just before returning
    const uniqueDiscovered = Array.from(new Set(discoveredUrls));
    return { discoveredUrls: uniqueDiscovered, skippedUrls };
}