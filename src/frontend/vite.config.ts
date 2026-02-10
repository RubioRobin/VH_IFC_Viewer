/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
        login: resolve(__dirname, "login.html"),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: true,
  },
  esbuild: {
    supported: {
      "top-level-await": true,
    },
  },
});
