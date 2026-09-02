// tests/mocks/wix-secrets-mock.ts
// Mock de wix-secrets-backend para tests

const mockSecrets = new Map<string, string>();

export const get = async (secretName: string) => {
  console.log(`[MOCK Wix Secrets] get: ${secretName}`);
  // Retornar valores mock para secrets comunes
  const defaults: Record<string, string> = {
    'WIX_BOOKINGS_API_KEY': 'mock-bookings-key',
    'WIX_PAYMENTS_API_KEY': 'mock-payments-key',
    'MADRID_TIMEZONE': 'Europe/Madrid'
  };
  return { value: mockSecrets.get(secretName) || defaults[secretName] || 'mock-secret-value' };
};

export const set = async (secretName: string, value: string) => {
  console.log(`[MOCK Wix Secrets] set: ${secretName}`);
  mockSecrets.set(secretName, value);
  return { success: true };
};

export default { get, set };
