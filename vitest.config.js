import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    mockReset: true,
  },
  resolve: {
    alias: {
      'backend': '/workspace/src/backend',
      'public': '/workspace/src/public',
      // Mock de módulos nativos de Wix para testing
      'wix-bookings.v2': '/workspace/tests/mocks/wix-bookings.v2.js',
      'wix-ecom-backend': '/workspace/tests/mocks/wix-ecom-backend.js',
      'wix-auth': '/workspace/tests/mocks/wix-auth.js',
      'wix-data': '/workspace/tests/mocks/wix-data.js',
      'wix-logger': '/workspace/tests/mocks/wix-logger.js',
      'wix-crypto': '/workspace/tests/mocks/wix-crypto.js',
      'wix-secrets-backend': '/workspace/tests/mocks/wix-secrets-backend.js',
    },
  },
});
