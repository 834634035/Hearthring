import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    fs: {
      allow: [repoRoot]
    },
    proxy: {
      "/api": "http://localhost:4000"
    }
  }
});
