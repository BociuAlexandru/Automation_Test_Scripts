// tests/e2e/config/sites.ts

export type SiteName = 'supercazino' | 'jocpacanele' | 'jocuricazinouri';

export type SiteConfig = {
  /** Where the crawler starts on this site (relative paths) */
  startPaths: string[];
  /** CSS selector for affiliate CTAs */
  ctaSelector: string;
  /** Only crawl URLs whose pathname matches at least one include pattern */
  includePatterns: RegExp[];
  /** Never crawl URLs whose pathname matches any exclude pattern */
  excludePatterns: RegExp[];
  /** Safety cap: max number of unique pages to visit per site run */
  maxPages: number;
};

export const siteConfigs: Record<SiteName, SiteConfig> = {
  supercazino: {
    startPaths: ['/'],
    ctaSelector: 'a.affiliate-meta-link[data-casino]',
    includePatterns: [
      /^\/$/,                  // homepage
      /^\/casino-online\/?/,   // main casino list
      /^\/bonusuri-casino\/?/, // bonuses
      /^\/casino-online-.*\/?/,
      /^\/blog\/.*/,           // blog posts with CTAs
    ],
    excludePatterns: [
      /^\/wp-admin\/?/,
      /^\/wp-json\/?/,
      /^\/tag\/.*/,
      /^\/author\/.*/,
      /^\/feed\/?/,
    ],
    maxPages: 200,
  },

  jocpacanele: {
    startPaths: ['/'],
    ctaSelector: 'a.affiliate-meta-link[data-casino]',
    includePatterns: [
      /^\/$/,
      /^\/bonusuri-casino\/?/,
      /^\/casino-online\/?/,
      /^\/blog\/.*/,
      /^\/jocuri-.*\/?/,
    ],
    excludePatterns: [
      /^\/wp-admin\/?/,
      /^\/wp-json\/?/,
      /^\/tag\/.*/,
      /^\/author\/.*/,
      /^\/feed\/?/,
    ],
    maxPages: 200,
  },

  jocuricazinouri: {
    startPaths: ['/'],
    ctaSelector: 'a.affiliate-meta-link[data-casino-name]',
    includePatterns: [
      /^\/$/,
      /^\/casino-online-romania\/?/,
      /^\/casino-online\/?/,
      /^\/blog\/.*/,
    ],
    excludePatterns: [
      /^\/wp-admin\/?/,
      /^\/wp-json\/?/,
      /^\/tag\/.*/,
      /^\/author\/.*/,
      /^\/feed\/?/,
    ],
    maxPages: 200,
  },
} as const;


  