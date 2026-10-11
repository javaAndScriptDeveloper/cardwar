import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

// Served by nginx under /app/ on the same origin as /api (see nginx/nginx.conf), so built asset URLs
// must carry that prefix. In `npm run dev` the API is proxied to a locally running backend.
export default defineConfig({
    base: '/app/',
    plugins: [preact()],
    server: {
        proxy: {
            '/api': { target: process.env.API_TARGET ?? 'http://localhost:8080', changeOrigin: true },
        },
    },
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'],
        setupFiles: ['src/test-setup.ts'],
    },
});
