import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  // 显式把 envDir 指向项目根（即 vite.config.ts 所在目录），
  // 否则默认会跟随 root 去 client/ 里找 .env.*，导致变量加载失败。
  envDir: path.resolve(import.meta.dirname),
  base: "./",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // 同源代理：前端直接请求 /api 即可，无需跨域。
    // 若用户显式设置了 VITE_API_BASE 指向 http://... 则代理不会被用到，行为也正确。
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
