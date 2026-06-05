import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Integration tests share the seeded DB; run files sequentially to avoid
    // cross-file interference.
    fileParallelism: false,
  },
});
