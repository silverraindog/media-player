import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    outDir: 'dist-frontend',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('firebase')) return 'vendor-firebase';
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('hls.js')) return 'vendor-hls';
          if (id.includes('vconsole')) return 'vendor-vconsole';
          if (id.includes('jszip')) return 'vendor-jszip';
          if (id.includes('motion') || id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('lucide-react')) return 'vendor-icons';
        },
      },
    },
  },
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    watch: {
      ignored: [
        '**/dist-frontend/**',
        '**/dist/**',
        '**/src-tauri/**',
        '**/samba_share/**',
        '**/tests/**',
        '**/.openqodex/**',
        '**/sambavault.db*',
      ],
    },
  },
});
