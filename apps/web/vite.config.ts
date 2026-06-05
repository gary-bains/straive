import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the app works when served from a GCS bucket
  // subpath (https://storage.googleapis.com/<bucket>/...).
  base: "./",
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { outDir: "dist", sourcemap: true },
});
