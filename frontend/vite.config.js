import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const parsedBackendPort = Number.parseInt(process.env.BACKEND_PORT || '3001', 10);
  const backendPort = Number.isInteger(parsedBackendPort) && parsedBackendPort > 0 && parsedBackendPort <= 65535
    ? parsedBackendPort
    : 3001;
  const backendOrigin = (process.env.BACKEND_ORIGIN || `http://127.0.0.1:${backendPort}`)
    .trim()
    .replace(/\/+$/, '');
  const usePolling = process.env.VITE_USE_POLLING === 'true';
  const proxy = {
    '/api': {
      target: backendOrigin,
      changeOrigin: true,
      secure: false,
      ws: true,
    },
  };

  return {
    css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      ...(usePolling ? { watch: { usePolling: true, interval: 1000 } } : {}),
      proxy,
    },
    preview: {
      host: true,
      port: 4173,
      proxy,
    },
  };
});



