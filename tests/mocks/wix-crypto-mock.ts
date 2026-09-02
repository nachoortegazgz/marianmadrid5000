// tests/mocks/wix-crypto-mock.ts
// Mock de wix-crypto para tests

export const createHash = (algorithm: string) => {
  console.log(`[MOCK Wix Crypto] createHash: ${algorithm}`);
  return {
    update: (data: string) => ({ 
      digest: () => `mock-hash-${algorithm}-${data.substring(0, 10)}` 
    }),
    digest: (encoding?: string) => `mock-hash-${algorithm}`
  };
};

export const createHmac = (algorithm: string, key: string) => {
  console.log(`[MOCK Wix Crypto] createHmac: ${algorithm}`);
  return {
    update: (data: string) => ({ 
      digest: () => `mock-hmac-${algorithm}-${data.substring(0, 10)}` 
    }),
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
