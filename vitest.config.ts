// vitest.config.ts - Configuración de Vitest para TypeScript y Wix Velo
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{ts,js}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/backend/**/*.ts'],
      exclude: ['**/*.d.ts', '**/types/**']
    },
    setupFiles: [],
    mockReset: true,
    clearMocks: true
  },
  resolve: {
    alias: {
      'backend': path.resolve(__dirname, './src/backend'),
      'public': path.resolve(__dirname, './src/public'),
      'wix-bookings.v2': path.resolve(__dirname, './tests/mocks/wix-bookings-mock.ts'),
      'wix-ecom-backend': path.resolve(__dirname, './tests/mocks/wix-ecom-mock.ts'),
      'wix-auth': path.resolve(__dirname, './tests/mocks/wix-auth-mock.ts'),
      'wix-data': path.resolve(__dirname, './tests/mocks/wix-data-mock.ts'),
      'wix-secrets-backend': path.resolve(__dirname, './tests/mocks/wix-secrets-mock.ts'),
      'wix-crypto': path.resolve(__dirname, './tests/mocks/wix-crypto-mock.ts'),
      '@wix/bookings': path.resolve(__dirname, './tests/mocks/wix-bookings-mock.ts'),
      '@wix/payments': path.resolve(__dirname, './tests/mocks/wix-payments-mock.ts')
    }
  }
});
