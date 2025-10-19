import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [
    crx({ manifest }),
    {
      name: 'firefox-manifest-cleanup',
      closeBundle() {
        // Remove Chrome-specific properties for Firefox compatibility
        const manifestPath = path.resolve(__dirname, 'dist/manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

          // Remove use_dynamic_url from web_accessible_resources
          if (manifestContent.web_accessible_resources) {
            manifestContent.web_accessible_resources.forEach((resource: any) => {
              delete resource.use_dynamic_url;
            });
          }

          fs.writeFileSync(manifestPath, JSON.stringify(manifestContent, null, 2));
          console.log('✓ Firefox-compatible manifest generated');
        }
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: 'inline', // Enable source maps for debugging
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
