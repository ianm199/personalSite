import { fileURLToPath } from 'node:url';
import { createEditorMiddleware } from './server/middleware.mjs';

/**
 * Dev-only blog editor. Both hooks are inert outside `astro dev`:
 * config setup returns early for build/sync, and astro:server:setup
 * only ever runs for the dev server, so nothing here can reach a
 * production build.
 *
 * @returns {import('astro').AstroIntegration}
 */
export default function editor() {
  let settings = null;
  return {
    name: 'blog-editor',
    hooks: {
      'astro:config:setup': ({ command, config, updateConfig }) => {
        if (command !== 'dev') {
          return;
        }
        updateConfig({
          vite: {
            optimizeDeps: {
              include: [
                'codemirror',
                '@codemirror/lang-markdown',
                '@codemirror/view',
                '@codemirror/state',
                '@codemirror/theme-one-dark',
                '@codemirror/commands',
                '@codemirror/language',
                '@codemirror/search',
                '@codemirror/autocomplete',
              ],
            },
          },
        });
        settings = {
          base: config.base.endsWith('/') ? config.base : `${config.base}/`,
          repoRoot: fileURLToPath(config.root),
          blogDir: fileURLToPath(new URL('src/content/blog/', config.root)),
          clientDir: fileURLToPath(new URL('./client/', import.meta.url)),
        };
      },
      'astro:server:setup': ({ server, refreshContent }) => {
        if (settings === null) {
          return;
        }
        server.middlewares.use(
          '/__edit',
          createEditorMiddleware({ ...settings, refreshContent }),
        );
      },
    },
  };
}
