import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

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
