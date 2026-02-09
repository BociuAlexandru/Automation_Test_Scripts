import { test, type Page, type Locator } from "@playwright/test";
import { siteConfigs, type SiteName } from "../config/sites";
import {
  closeCookiePopupIfPresent,
  closeOptionalPopupIfPresent,
} from "../helpers/mobileMenuUtils";
import * as fs from "fs";
import path from "path";

type CasinoAttributeRecord = {
  attribute: "data-casino" | "data-casino-name";
  value: string;
  href: string;
  text: string;
  position: string | null;
};

type ProjectArchiveDump = {
  archiveUrl: string;
  totalButtonsDetected: number;
  capturedAttributes: CasinoAttributeRecord[];
};

const CTA_ATTRIBUTE_KEYS = ["data-casino", "data-casino-name"] as const;
const OUTPUT_FILENAME = "casino-cta-data.json";
const OUTPUT_FILE_PATH = path.join(process.cwd(), OUTPUT_FILENAME);

const CASINO_ARCHIVE_URLS: Record<SiteName, string> = {
  "casino.com.ro": "https://casino.com.ro/cazinouri/",
  jocpacanele: "https://jocpacanele.ro/top-casino-online-romania/",
  jocuricazinouri: "https://jocuricazinouri.com/casino-online-romania/",
  jocsloturi: "https://jocsloturi.ro/sloturi-casino-online/",
  beturi: "https://beturi.ro/top-casino-online/",
  supercazino: "https://www.supercazino.ro/casino-online/",
};

test.describe("Data Casino parameter collector", () => {
  test("Extract CTA data attributes for archive pages", async ({ page }, testInfo) => {
    const projectName = testInfo.project.name as SiteName;
    const archiveUrl = CASINO_ARCHIVE_URLS[projectName];

    if (!archiveUrl) {
      test.skip(true, `No archive URL configured for project ${projectName}`);
    }

    await navigateToArchive(page, projectName, archiveUrl);

    const ctaLocator = await resolveCtaLocator(page, projectName);
    const totalButtonsDetected = await ctaLocator.count();

    const capturedAttributes = totalButtonsDetected
      ? await collectAttributeRecords(ctaLocator)
      : [];

    console.log(
      `[${projectName}] Captured ${capturedAttributes.length} unique data attributes from ${totalButtonsDetected} CTA buttons.`,
    );

    persistProjectDump(projectName, {
      archiveUrl,
      totalButtonsDetected,
      capturedAttributes,
    });

    testInfo.attachments.push({
      name: `${projectName}-casino-cta-data`,
      contentType: "application/json",
      body: Buffer.from(JSON.stringify(capturedAttributes, null, 2), "utf8"),
    });
  });
});

async function resolveCtaLocator(page: Page, siteName: SiteName): Promise<Locator> {
  const configuredSelector = siteConfigs[siteName].ctaSelector;
  const fallbackSelectors = [
    configuredSelector,
    "a.affiliate-meta-link[data-casino]",
    "a.affiliate-meta-link[data-casino-name]",
    "a.affiliate-meta-link",
    "a[data-casino]",
    "a[data-casino-name]",
  ].filter(Boolean) as string[];

  for (const selector of fallbackSelectors) {
    const locator = page.locator(selector);
    if ((await locator.count()) > 0) {
      if (selector !== configuredSelector) {
        console.log(`[${siteName}] Using fallback CTA selector: ${selector}`);
      }
      return locator;
    }
  }

  console.warn(
    `[${siteName}] No CTA buttons found with known selectors. Returning broad locator for diagnostics.`,
  );
  return page.locator("a[data-casino], a[data-casino-name]");
}

async function navigateToArchive(page: Page, siteName: SiteName, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await closeCookiePopupIfPresent(page, siteName);
  await closeOptionalPopupIfPresent(page, siteName);
}

async function collectAttributeRecords(locator: Locator) {
  const rawRecords = await locator.evaluateAll<(
    | CasinoAttributeRecord
    | null
  )[]>((nodes) => {
    const attrKeys = ["data-casino", "data-casino-name"] as const;
    return nodes.map((node) => {
      const matchingAttr = attrKeys.find((attr) => node.hasAttribute(attr));
      if (!matchingAttr) return null;

      const attrValue = node.getAttribute(matchingAttr)?.trim();
      if (!attrValue) return null;

      const textContent = (node.textContent || "").replace(/\s+/g, " ").trim();
      const href = node.getAttribute("href") || "";
      const position = node.getAttribute("data-position") ?? null;

      return {
        attribute: matchingAttr,
        value: attrValue,
        href,
        text: textContent,
        position,
      } satisfies CasinoAttributeRecord;
    });
  });

  const filteredRecords = rawRecords.filter(
    (record): record is CasinoAttributeRecord => record !== null,
  );

  const uniqueRecords = new Map<string, CasinoAttributeRecord>();
  for (const record of filteredRecords) {
    if (!uniqueRecords.has(record.value)) {
      uniqueRecords.set(record.value, record);
    }
  }

  return Array.from(uniqueRecords.values());
}

function persistProjectDump(projectName: SiteName, dump: ProjectArchiveDump) {
  const existing = readExistingOutput();
  existing[projectName] = dump;
  fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(existing, null, 2), {
    encoding: "utf8",
  });
  console.log(`[${projectName}] Updated ${OUTPUT_FILENAME} at repo root.`);
}

function readExistingOutput(): Record<string, ProjectArchiveDump> {
  if (!fs.existsSync(OUTPUT_FILE_PATH)) {
    return {} as Record<string, ProjectArchiveDump>;
  }

  try {
    const raw = fs.readFileSync(OUTPUT_FILE_PATH, { encoding: "utf8" });
    return JSON.parse(raw) as Record<string, ProjectArchiveDump>;
  } catch (error) {
    console.warn(
      `[WARN] Failed to parse existing ${OUTPUT_FILENAME}. Recreating file. Error: ${error}`,
    );
    return {} as Record<string, ProjectArchiveDump>;
  }
}
