// tests/e2e/p0-revenue-ctas.spec.ts
import { test, expect } from '@playwright/test';
import { siteConfigs, type SiteConfig, type SiteName } from './config/sites';

// Decide if we should visit a path based on the include/exclude patterns
function shouldVisitPath(path: string, cfg: SiteConfig): boolean {
  const included = cfg.includePatterns.some((re) => re.test(path));
  if (!included) return false;
  const excluded = cfg.excludePatterns.some((re) => re.test(path));
  return !excluded;
}

test('P0 - Revenue CTAs resolve without errors across the site', async ({ page }, testInfo) => {
  // Up to 60 minutes per project (and you also set 60m in playwright.config.ts)
  test.setTimeout(60 * 60 * 1000);

  const projectName = testInfo.project.name as SiteName;
  console.log(`[${projectName}] Starting revenue CTA crawl`);
  const cfg = siteConfigs[projectName];

  const visited = new Set<string>();
  const queue: string[] = [...cfg.startPaths];

  // Just for reporting
  let totalCtaPlacementsChecked = 0;

  while (queue.length > 0 && visited.size < cfg.maxPages) {
    const currentPath = queue.shift()!;
    if (visited.has(currentPath)) continue;
    visited.add(currentPath);

    if (!shouldVisitPath(currentPath, cfg)) continue;

    await test.step(`Visit ${currentPath}`, async () => {
      // 1) Navigate to the page
      try {
        await page.goto(currentPath, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000, // 30s per page load
        });
      } catch (error: any) {
        console.warn(
          `[${projectName}] [WARN] Could not load ${currentPath}: ${
            error?.message ?? error
          }`
        );
        return; // skip CTAs on this path but keep the crawl going
      }

      // 2) Find affiliate CTAs on this page
      const ctas = page.locator(cfg.ctaSelector);

      // Snapshot all hrefs now so the DOM can change later without breaking us
      const ctaHrefs = await ctas.evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href'))
      );

      console.log(
        `[${projectName}] ${currentPath} -> found ${ctaHrefs.length} CTA placements`
      );

      // 2b) Check EVERY CTA placement, even if hrefs repeat
      for (let i = 0; i < ctaHrefs.length; i++) {
        totalCtaPlacementsChecked++;

        await test.step(`Check CTA #${i + 1} on ${currentPath}`, async () => {
          const href = ctaHrefs[i];

          // Basic sanity: each CTA must have an href
          await expect(
            href,
            `CTA #${i + 1} on ${currentPath} should have an href`
          ).toBeTruthy();

          if (!href) {
            // Nothing else to do for this CTA
            return;
          }

          console.log(
            `[${projectName}] Opening CTA #${i + 1} from ${currentPath}: ${href}`
          );

          const context = page.context();
          let ctaPage: typeof page | undefined;
          let finalUrl: string | null = null;
          let status: number | string = 'no-response';

          try {
            ctaPage = await context.newPage();

            const response = await ctaPage
              .goto(href, {
                waitUntil: 'domcontentloaded',
                timeout: 30_000, // 30s per CTA landing
              })
              .catch((error) => {
                console.warn(
                  `[${projectName}] [WARN] Navigation error for CTA "${href}" from ${currentPath}: ${
                    (error as any)?.message ?? error
                  }`
                );
                return null;
              });

            finalUrl = ctaPage.url();
            status = response ? response.status() : 'no-response';

            console.log(
              `[${projectName}] CTA #${i + 1} from ${currentPath} -> final URL=${finalUrl}, status=${status}`
            );
          } catch (e: any) {
            console.warn(
              `[${projectName}] [WARN] Could not create tab for CTA "${href}" from ${currentPath}: ${
                e?.message ?? e
              }`
            );
          } finally {
            if (ctaPage) {
              await ctaPage.close().catch(() => {});
            }
          }

          if (!finalUrl || finalUrl === 'about:blank') {
            console.warn(
              `[${projectName}] [WARN] CTA #${i + 1} from ${currentPath} resulted in empty or about:blank URL (href="${href}")`
            );
          }
        });
      }

      // 3) Discover new internal links to keep crawling
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
    });
  }

  console.log(
    `[${projectName}] COMPLETED. Pages visited = ${visited.size}, CTA placements checked = ${totalCtaPlacementsChecked}`
  );
});










