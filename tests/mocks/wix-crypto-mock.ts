// tests/mocks/wix-crypto-mock.ts
// Mock de wix-crypto para tests

import { createHash as nodeCreateHash, createHmac as nodeCreateHmac, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';

export const createHash = (algorithm: string) => {
  return nodeCreateHash(algorithm);
};

export const createHmac = (algorithm: string, key: string) => {
  return nodeCreateHmac(algorithm, key);
};

export const timingSafeEqual = (a: Buffer, b: Buffer) => {
  if (a.length !== b.length) return false;
  return nodeTimingSafeEqual(a, b);
};

export default { createHash, createHmac, timingSafeEqual };
