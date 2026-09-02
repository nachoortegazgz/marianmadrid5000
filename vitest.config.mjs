import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{js,ts}"],
    mockReset: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      backend: path.resolve(rootDir, "src/backend"),
      public: path.resolve(rootDir, "src/public"),
      "wix-bookings.v2": path.resolve(rootDir, "tests/mocks/wix-bookings-mock.ts"),
      "wix-ecom-backend": path.resolve(rootDir, "tests/mocks/wix-ecom-mock.ts"),
      "wix-auth": path.resolve(rootDir, "tests/mocks/wix-auth-mock.ts"),
      "wix-data": path.resolve(rootDir, "tests/mocks/wix-data-mock.ts"),
      "wix-secrets-backend": path.resolve(rootDir, "tests/mocks/wix-secrets-mock.ts"),
      "wix-crypto": path.resolve(rootDir, "tests/mocks/wix-crypto-mock.ts"),
      "@wix/bookings": path.resolve(rootDir, "tests/mocks/wix-bookings-mock.ts"),
      "@wix/payments": path.resolve(rootDir, "tests/mocks/wix-payments-mock.ts"),
    },
  },
});