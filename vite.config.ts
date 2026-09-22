import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  // Пре-бандлинг ломает воркер maplibre-gl (dep optimizer теряет
  // maplibre-gl-worker.mjs), из-за чего тайлы не парсятся и карта чёрная.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      "/piper-proxy": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/piper-proxy/, ""),
      },
      "/asr-proxy": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/asr-proxy/, ""),
      },
    },
  },
}));
