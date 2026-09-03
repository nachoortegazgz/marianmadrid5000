// tests/mocks/wix-crypto-mock.ts
// Mock de wix-crypto para tests

export const createHash = (algorithm: string) => {
  console.log(`[MOCK Wix Crypto] createHash: ${algorithm}`);
  return {
    update: (_data: string) => ({ digest: () => 'mock-hash' }),
    digest: (encoding?: string) => `mock-hash-${algorithm}`
  };
};

export const createHmac = (algorithm: string, key: string) => {
  console.log(`[MOCK Wix Crypto] createHmac: ${algorithm}`);
  return {
    update: (_data: string) => ({ digest: () => 'mock-hmac' }),
    digest: (encoding?: string) => `mock-hmac-${algorithm}`
  };
};

export const timingSafeEqual = (a: Buffer, b: Buffer) => {
  console.log('[MOCK Wix Crypto] timingSafeEqual');
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export default { createHash, createHmac, timingSafeEqual };
