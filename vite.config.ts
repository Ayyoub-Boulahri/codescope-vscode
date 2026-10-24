/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Builds the webview UI to fixed file names that src/extension/panel.ts links to.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/webview/main.tsx',
      output: { entryFileNames: 'index.js', assetFileNames: 'index[extname]' },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
