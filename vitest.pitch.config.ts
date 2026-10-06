import { defineConfig } from "vitest/config";
import path from "node:path";

/** Alleen voor het maken van de pitch-pdf (npm run pitch); niet onderdeel van de testsuites. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } },
  test: { environment: "node", include: ["scripts/pitch/capture.test.ts"], globalSetup: ["tests/global-setup.ts"], fileParallelism: false, testTimeout: 300000, hookTimeout: 180000 },
});
