import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',

  // ⏱️ Hard set per-test timeout to 60 minutes
  timeout: 60 * 60 * 1000,

  projects: [
    {
      name: 'supercazino',
      use: { baseURL: 'https://www.supercazino.ro' },
    },
    {
      name: 'jocpacanele',
      use: { baseURL: 'https://jocpacanele.ro' },
    },
    {
      name: 'jocuricazinouri',
      use: { baseURL: 'https://jocuricazinouri.com' },
    },
  ],
});


