import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'ClawBoard — AI Command Center',
        short_name: 'ClawBoard',
        description: 'Centre de commandement NemoClaw — pilotez tous vos agents IA depuis un seul tableau de bord.',
        theme_color: '#8b5cf6',
        background_color: '#0f0f13',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        lang: 'fr',
        categories: ['productivity', 'developer tools'],
        icons: [
          { src: 'pwa-64x64.png',          sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png',         sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',         sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache strategy: network-first for API calls, cache-first for assets
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/localhost:4000\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nemoclaw-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico|webp|woff2?)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
        // Don't cache SSE streams
        navigateFallbackDenylist: [/\/api\//],
      },
      devOptions: {
        enabled: false, // désactivé en dev (évite les conflits HMR)
      },
    }),
  ],

  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // React core
            if (['react', 'react-dom', 'react-router-dom'].some(p => id.includes(`/node_modules/${p}/`)))
              return 'vendor-react';
            // UI components
            if (id.includes('/node_modules/lucide-react/') || id.includes('/node_modules/react-joyride/'))
              return 'vendor-ui';
            // Data fetching & validation
            if (id.includes('/node_modules/@tanstack/react-query/') || id.includes('/node_modules/zod/'))
              return 'vendor-data';
            // Markdown & editor
            if (id.includes('/node_modules/react-markdown/') || id.includes('/node_modules/remark-') || id.includes('/node_modules/react-syntax-highlighter/') || id.includes('/node_modules/@monaco-editor/'))
              return 'vendor-editor';
            // DnD & virtualization
            if (id.includes('/node_modules/@dnd-kit/') || id.includes('/node_modules/react-virtuoso/'))
              return 'vendor-interaction';
            // MCP & ACP SDK
            if (id.includes('/node_modules/@modelcontextprotocol/') || id.includes('/node_modules/@agentclientprotocol/'))
              return 'vendor-protocol';
            // Flow & animation
            if (id.includes('/node_modules/@xyflow/') || id.includes('/node_modules/framer-motion/'))
              return 'vendor-flow';
            // Utils
            if (id.includes('/node_modules/date-fns/') || id.includes('/node_modules/dompurify/') || id.includes('/node_modules/croner/'))
              return 'vendor-utils';
          }
        },
      },
    },
  },
})
