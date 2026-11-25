import { defineConfig } from 'astro/config';

// Fully static output: `npm run build` writes dist/, which Netlify publishes.
// Once the domain is known, add  site: 'https://your-domain.com'  so canonical links and the sitemap are absolute.
export default defineConfig({
  output: 'static',
  outDir: process.env.MGY_OUT_DIR || 'dist', // the browser test builds into its own folder
  compressHTML: true,
  build: { inlineStylesheets: 'auto' },
  // three.js (the 3D chain) is one ~650 KB chunk that only the home page loads, so the default 500 KB warning is expected.
  vite: { build: { chunkSizeWarningLimit: 800 } },
});
