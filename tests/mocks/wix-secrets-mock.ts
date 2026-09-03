// tests/mocks/wix-secrets-mock.ts
// Mock de wix-secrets-backend para tests

export const getSecret = async (key: string) => {
  const secrets: Record<string, string> = {
    SECRET_FISCALKEY: 'mock-fiscal-key',
    SECRET_AUTH_JWT_KEY: 'mock-jwt-key',
    ADMIN_EMAILS: 'admin@example.com',
    CAJERO_EMAILS: 'cajero@example.com',
  };
  return secrets[key] || '';
};

export const get = getSecret;

export const set = async (secretName: string, value: string) => {
  console.log(`[MOCK Wix Secrets] set: ${secretName}`);
  mockSecrets.set(secretName, value);
  return { success: true };
};

export default { getSecret, get, set };
