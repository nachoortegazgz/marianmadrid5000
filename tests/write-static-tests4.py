#!/usr/bin/env python3
content = '''
describe('bookingCore.js - Errores', () => {
  it('createBookingError con code', async () => {
    const m = await import('../src/backend/booking/bookingCore.js');
    const e = m.createBookingError(m.ERROR_CODES.INVALID_PAYLOAD, 'test', { x: 1 });
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('INVALID_PAYLOAD');
    expect(e.details).toEqual({ x: 1 });
  });
  it('ERROR_CODES completos', async () => {
    const m = await import('../src/backend/booking/bookingCore.js');
    const req = ['INVALID_PAYLOAD', 'TOKEN_BUSY', 'FISCAL_VIOLATION', 'BOOKING_CREATION_FAILED', 'RATE_LIMITED', 'TIMEOUT'];
    for (const c of req) expect(m.ERROR_CODES[c]).toBeDefined();
  });
  it('logger metodos', async () => {
    const m = await import('../src/backend/booking/bookingCore.js');
    expect(typeof m.logger.error).toBe('function');
    expect(typeof m.logger.warn).toBe('function');
    expect(typeof m.logger.info).toBe('function');
  });
});

describe('security.js - Rate Limiter', () => {
  it('permite dentro limite', async () => {
    const m = await import('../src/backend/security.js');
    const r = m.rateLimiter({ surface: 't1', key: 'k1' }, 5, 10000);
    expect(r.allowed).toBe(true);
  });
  it('bloquea excesos', async () => {
    const m = await import('../src/backend/security.js');
    const cfg = { surface: 't2', key: 'k2' };
    for (let i = 0; i < 5; i++) m.rateLimiter(cfg, 5, 10000);
    expect(m.rateLimiter(cfg, 5, 10000).allowed).toBe(false);
  });
  it('isKeyPersistentlyBlocked boolean', async () => {
    const m = await import('../src/backend/security.js');
    const r = await m.isKeyPersistentlyBlocked('s', 'k');
    expect(typeof r).toBe('boolean');
  });
});

describe('Validaciones cruzadas', () => {
  it('TZ Europe/Madrid', () => {
    expect(SDK_CONFIG.TZ).toBe('Europe/Madrid');
  });
  it('SINGLETONS.CAJA', () => {
    expect(SINGLETONS.CAJA).toBe('CAJA_PRINCIPAL');
  });
  it('sin guiones en valores', () => {
    for (const v of Object.values(COLLECTIONS)) {
      expect(v).not.toMatch(/_/);
    }
  });
  it('STATES 3 estados', () => {
    expect(SERVICE_CATALOG.STATES).toHaveLength(3);
  });
  it('CATEGORIES 5 categorias', () => {
    expect(SERVICE_CATALOG.CATEGORIES).toHaveLength(5);
  });
});

describe('Edge cases negocio', () => {
  it('IVA 21%', () => {
    expect(_roundMoney(10 * 1.21)).toBe(12.1);
  });
  it('IVA 10%', () => {
    expect(_roundMoney(10 * 1.10)).toBe(11);
  });
  it('rechaza americano', () => {
    expect(_readDate('01/15/2026')).toBeNull();
  });
  it('rechaza ISO', () => {
    expect(_readDate('2026-01-01T00:00:00Z')).toBeNull();
  });
  it('acepta marianmadrid.es', () => {
    expect(_isValidEmail('<EMAIL>')).toBe(true);
  });
});

describe('Anti-regresiones', () => {
  it('no statusPago', () => {
    expect((CITA_FIELDS as any).statusPago).toBeUndefined();
    expect((CITA_FIELDS as any).location).toBeUndefined();
    expect((CITA_FIELDS as any).locationId).toBeUndefined();
    expect((CITA_FIELDS as any).fechaYmdMadrid).toBeUndefined();
    expect((CITA_FIELDS as any).idFactura).toBeUndefined();
    expect((CITA_FIELDS as any).idRecepcion).toBeUndefined();
  });
  it('no COMPLEMENTOS_CATALOGO', () => {
    expect((COLLECTIONS as any).COMPLEMENTOS_CATALOGO).toBeUndefined();
  });
  it('CAJA_STATUS espanol', () => {
    expect(CAJA_STATUS.OPEN).toBe('ABIERTA');
    expect(CAJA_STATUS.CLOSED).toBe('CERRADA');
  });
  it('COLLAB_ROLES coincide', () => {
    const a = Object.values(COLLAB_ROLES).sort();
    const b = [...STAFF_ACCESS.ALLOWED_ROLES].sort();
    expect(a).toEqual(b);
  });
});
'''
with open('/workspaces/marianmadrid5000/tests/static-contracts.test.ts', 'a') as f:
    f.write(content)
print('Part 4 done')
