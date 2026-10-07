import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(import.meta.dirname, "test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    env: { DATABASE_PATH: ":memory:", DATA_DIR: path.resolve(import.meta.dirname, ".test-data"), UPLOAD_CHUNK_MB: "1" },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
