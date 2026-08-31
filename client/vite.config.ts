import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on the LAN so a second device can reach this dev server
    port: 5199, // fixed, non-default port to avoid clashing with other local dev servers
    strictPort: true,
    // Lets a Cloudflare quick-tunnel hostname through Vite's Host-header check (blocked by
    // default as an anti-DNS-rebinding measure) — temporary sharing use only.
    allowedHosts: ['.trycloudflare.com'],
  },
});
