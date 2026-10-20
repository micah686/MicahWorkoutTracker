import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  base: process.env.BASE_PATH || "./",
  worker: { format: "es" },
});
