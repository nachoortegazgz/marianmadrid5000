// tests/security.test.js
// Regresion: security.js usaba COLLECTIONS sin importarlo (deploy Velo: no-undef).
// El try/catch interno enmascaraba el ReferenceError, por eso se verifica que
// la query llegue a ejecutarse contra la coleccion canonica RATE_LIMIT_BLOCKS.
import { describe, it, expect, vi } from 'vitest';

import wixData from 'wix-data';
import { isKeyPersistentlyBlocked } from '../src/backend/security.js';

describe('security: bloqueos persistentes del rate limiter', () => {
  it('consulta la coleccion canonica RATE_LIMIT_BLOCKS sin ReferenceError', async () => {
    const spy = vi.spyOn(wixData, 'query');
    const result = await isKeyPersistentlyBlocked('booking', 'key-1');
    expect(result).toBe(false);
    expect(spy).toHaveBeenCalledWith('RateLimitBlocks');
    spy.mockRestore();
  });

  it('detecta un bloqueo vigente y devuelve true', async () => {
    const spy = vi.spyOn(wixData, 'query').mockImplementation(() => {
      const q = {
        eq: vi.fn(() => q),
        gt: vi.fn(() => q),
        limit: vi.fn(() => q),
        find: vi.fn(async () => ({ items: [{ _id: 'RL-1' }] })),
      };
      return q;
    });
    const result = await isKeyPersistentlyBlocked('booking', 'key-1');
    expect(result).toBe(true);
    spy.mockRestore();
  });
});
