import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    // Babylon NullEngine suites are CPU-heavy. Keeping two workers avoids
    // resource contention on ordinary laptops while preserving parallelism.
    maxWorkers: 2,
    testTimeout: 20_000,
  },
});
