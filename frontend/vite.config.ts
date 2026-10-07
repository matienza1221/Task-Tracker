import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

  // Development HTTPS with the OpenSSL certificates from scripts/generate-certs.sh.
  // Enabled automatically when the certificates exist; set VITE_DEV_HTTPS=false
  // to force plain HTTP (the Docker dev stack does this).
  const certsDir = path.resolve(process.cwd(), env.CERTS_DIR || '../certs');
  const keyPath = path.join(certsDir, 'dev.key');
  const certPath = path.join(certsDir, 'dev.crt');
  const hasCerts = fs.existsSync(keyPath) && fs.existsSync(certPath);
  const httpsEnabled = env.VITE_DEV_HTTPS === undefined ? hasCerts : env.VITE_DEV_HTTPS !== 'false';
  const https =
    httpsEnabled && hasCerts
      ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
      : undefined;

  // The source tree is bind-mounted from the host, so native filesystem events
  // do not reach the container reliably (Windows + Docker Desktop). Polling is
  // what makes hot reload see edits without restarting the container.
  const hmrHost = env.VITE_HMR_HOST || 'localhost';
  const hmrClientPort = Number(env.VITE_HMR_CLIENT_PORT || 5180);
  const hmr = https
    ? { protocol: 'wss' as const, host: hmrHost, clientPort: hmrClientPort }
    : { protocol: 'ws' as const, host: hmrHost, clientPort: hmrClientPort };

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: 5180,
      strictPort: true,
      https,
      watch: {
        usePolling: true,
        interval: 300,
      },
      hmr,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: { port: 4173 },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-query': ['@tanstack/react-query', 'axios'],
            'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
            'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  };
});
