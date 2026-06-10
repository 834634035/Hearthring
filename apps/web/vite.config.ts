import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [react()],
  resolve: {
    // 通过 npm 依赖解析入口，避免手写 packages/shared 路径
    alias: {
      "@tribal-epic/shared": require.resolve("@tribal-epic/shared")
    },
    preserveSymlinks: true
  },
  optimizeDeps: {
    // workspace 包走源码，避免预构建缓存旧导出
    exclude: ["@tribal-epic/shared"]
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      allow: [repoRoot]
    },
    proxy: {
      "/api": "http://localhost:4000"
    }
  }
});
