import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './public/manifest.json';

export default defineConfig({
  plugins: [crx({ manifest })],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    hmr: {
      clientPort: 5173,
    },
  },
  build: {
    outDir: 'dist',
    minify: false, // Disable minification for debugging
    sourcemap: true, // Generate sourcemaps
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        options: 'src/options/index.html',
      },
      output: {
        // Keep readable variable names
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
