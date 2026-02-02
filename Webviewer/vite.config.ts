/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    allowedHosts: true,
  },
  esbuild: {
    supported: {
      "top-level-await": true,
    },
  },
});
