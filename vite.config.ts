/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // sim/ is headless and runs in Node. Nothing in Slice 0 needs a DOM
    // environment; if ui/ tests ever need one, opt in per file with
    // `// @vitest-environment jsdom` rather than making it the default.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
