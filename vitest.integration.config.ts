import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/api/**/*.integration.test.ts"],
    environment: "node",
    setupFiles: ["apps/api/src/test-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
