import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import react from "@vitejs/plugin-react";

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    watch: {
      usePolling: true,
      interval: 200,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});



