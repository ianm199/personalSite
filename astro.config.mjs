// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import editor from './editor/integration.mjs';

export default defineConfig({
  site: 'https://ianm199.github.io',
  base: '/personalSite',
  integrations: [sitemap(), editor()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
  },
});
