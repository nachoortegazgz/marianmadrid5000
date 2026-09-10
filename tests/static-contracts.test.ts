/**
 * tests/static-contracts.test.ts
 */
import { describe, it, expect } from 'vitest';
import { COLLECTIONS, SDK_CONFIG, SERVICE_CATALOG, TIPO_FICHAJE, TIPO_MOVIMIENTO, ESTADO_CITA, ESTADO_PAGO, CITA_FIELDS, STAFF_ACCESS, IVA_RATES, CAJA_STATUS, SINGLETONS, CONCURRENCY, SLOT_SEARCH, API, JWT, COLLAB_ROLES } from '../src/backend/internalConfig.js';
import { SECRETS } from '../src/backend/mmSecrets.js';
import { _safeTrim, _roundMoney, _isValidEmail, _maskEmail, _maskPhone, _maskName, _maskIp, _readDate, _readPositiveAmount, _readNonNegativeAmount, _cleanText, _stableSerialize, _looksLikeGuid, _generateUUID, _hashKey, _normalizeIdPart, _cloneDeep, _extractRelationalId } from '../src/public/mmUtils.js';
import cmsContract from './cms-contract.json' assert { type: 'json' };

describe('SSOT Inmutabilidad', () => {
  it('COLLECTIONS frozen', () => {
    expect(Object.isFrozen(COLLECTIONS)).toBe(true);
    expect(() => { (COLLECTIONS as any).X = 'Y'; }).toThrow();
  });
  it('SDK_CONFIG frozen', () => {
    expect(Object.isFrozen(SDK_CONFIG)).toBe(true);
    expect(Object.isFrozen(SDK_CONFIG.TIMEOUTS)).toBe(true);
    expect(Object.isFrozen(SDK_CONFIG.CACHE)).toBe(true);
  });
  it('SERVICE_CATALOG correcto', () => {
    expect(SERVICE_CATALOG.CURRENCY).toBe('EUR');
    expect(SERVICE_CATALOG.MAX_TITLE_LENGTH).toBe(160);
    expect(SERVICE_CATALOG.MAX_DURATION_MINUTES).toBe(1440);
  });
  it('TIPO_FICHAJE 5 tipos', () => {
    expect(Object.values(TIPO_FICHAJE)).toHaveLength(5);
    expect((TIPO_FICHAJE as any).ENTRADA_MANUAL).toBeUndefined();
  });
  it('TIPO_MOVIMIENTO 7 tipos', () => {
    expect(Object.values(TIPO_MOVIMIENTO)).toHaveLength(7);
  });
  it('paymentStatus canonico', () => {
    expect(CITA_FIELDS.STATUS_PAGO).toBe('paymentStatus');
    expect((CITA_FIELDS as any).statusPago).toBeUndefined();
  });
  it('STAFF_ACCESS 3 roles', () => {
    expect(STAFF_ACCESS.ALLOWED_ROLES).toEqual(['ADMIN', 'GESTION', 'ESTILISTA']);
  });
  it('IVA_RATES 4 tasas', () => {
    expect(IVA_RATES.GENERAL).toBe(0.21);
    expect(IVA_RATES.REDUCIDO).toBe(0.10);
    expect(IVA_RATES.SUPERREDUCIDO).toBe(0.04);
    expect(IVA_RATES.EXENTO).toBe(0.0);
  });
  it('SLOT_SEARCH 14 dias', () => {
    expect(SLOT_SEARCH.DIAS_LIMITE).toBe(14);
  });
  it('API IDs', () => {
    expect(API.STAFF_RESOURCE_TYPE_ID).toBe('1cd44cf8-756f-41c3-bd90-3e2ffcaf1155');
  });
  it('JWT config', () => {
    expect(JWT.ALGORITHM).toBe('HS256');
    expect(JWT.EXPIRATION_MS).toBe(1800000);
  });
});

describe('Consistencia cms-contract', () => {
  it('internalConfig en cms-contract', () => {
    for (const [k, v] of Object.entries(COLLECTIONS)) {
      expect(cmsContract.collections[k]).toBe(v);
    }
  });
  it('cms-contract en internalConfig', () => {
    for (const [k, v] of Object.entries(cmsContract.collections)) {
      expect((COLLECTIONS as any)[k]).toBe(v);
    }
  });
  it('32 colecciones', () => {
    expect(Object.keys(COLLECTIONS)).toHaveLength(32);
  });
  it('si COMPLEMENTOS_CATALOGO', () => {
    expect((COLLECTIONS as any).COMPLEMENTOS_CATALOGO).toBe('ComplementosCatalogo');
  });
  it('PascalCase IDs', () => {
    for (const v of Object.values(COLLECTIONS)) {
      expect(v).toMatch(/^[A-Z][a-zA-Z0-9]+$/);
    }
  });
});
describe('mmUtils - _roundMoney', () => {
  it('resuelve 0.1 + 0.2', () => {
    expect(_roundMoney(0.1 + 0.2)).toBe(0.3);
  });
  it('redondeo half-up', () => {
    expect(_roundMoney(1.005)).toBe(1.01);
    expect(_roundMoney(1.004)).toBe(1);
  });
  it('no finitos retornan 0', () => {
    expect(_roundMoney(NaN)).toBe(0);
    expect(_roundMoney(Infinity)).toBe(0);
    expect(_roundMoney(-Infinity)).toBe(0);
  });
  it('negativos', () => {
    expect(_roundMoney(-10.555)).toBe(-10.56);
  });
});

describe('mmUtils - _isValidEmail', () => {
  it('validos', () => {
    expect(_isValidEmail('<EMAIL>')).toBe(true);
    expect(_isValidEmail('<EMAIL>')).toBe(true);
    expect(_isValidEmail('a@b.co')).toBe(true);
  });
  it('invalidos', () => {
    expect(_isValidEmail('')).toBe(false);
    expect(_isValidEmail('notanemail')).toBe(false);
    expect(_isValidEmail('@nodomain')).toBe(false);
    expect(_isValidEmail('no@tld')).toBe(false);
    expect(_isValidEmail('spaces in@email.com')).toBe(false);
  });
  it('null/undefined', () => {
    expect(_isValidEmail(null as any)).toBe(false);
    expect(_isValidEmail(undefined as any)).toBe(false);
  });
});

describe('mmUtils - _maskEmail', () => {
  it('enmascara', () => {
    expect(_maskEmail('<EMAIL>')).toBe('jo***@do***.com');
    expect(_maskEmail('<EMAIL>')).toBe('t***@do***.com');
  });
  it('invalidos retornan ***', () => {
    expect(_maskEmail('')).toBe('***');
    expect(_maskEmail('notanemail')).toBe('***');
  });
  it('nunca expone completo', () => {
    const m = _maskEmail('<EMAIL>');
    expect(m).not.toContain('john');
    expect(m).toContain('***');
  });
});

describe('mmUtils - _readDate', () => {
  it('validas', () => {
    expect(_readDate('2026-01-01')).toBe('2026-01-01');
    expect(_readDate('2024-02-29')).toBe('2024-02-29');
  });
  it('invalidas', () => {
    expect(_readDate('2026-13-01')).toBeNull();
    expect(_readDate('2026-00-01')).toBeNull();
    expect(_readDate('2026-01-32')).toBeNull();
    expect(_readDate('2026-02-30')).toBeNull();
    expect(_readDate('2026-04-31')).toBeNull();
    expect(_readDate('2023-02-29')).toBeNull();
    expect(_readDate('not-a-date')).toBeNull();
    expect(_readDate('2026/01/01')).toBeNull();
  });
  it('null/undefined', () => {
    expect(_readDate(null as any)).toBeNull();
    expect(_readDate(undefined as any)).toBeNull();
  });
});

describe('mmUtils - _readPositiveAmount', () => {
  it('validos', () => {
    expect(_readPositiveAmount('10')).toBe(10);
    expect(_readPositiveAmount('0.01')).toBe(0.01);
  });
  it('invalidos', () => {
    expect(_readPositiveAmount('0')).toBeNull();
    expect(_readPositiveAmount('-1')).toBeNull();
    expect(_readPositiveAmount('')).toBeNull();
    expect(_readPositiveAmount(null as any)).toBeNull();
    expect(_readPositiveAmount('abc')).toBeNull();
  });
});

describe('mmUtils - _readNonNegativeAmount', () => {
  it('validos', () => {
    expect(_readNonNegativeAmount('0')).toBe(0);
    expect(_readNonNegativeAmount('10')).toBe(10);
    expect(_readNonNegativeAmount('10.7')).toBe(11);
  });
  it('invalidos', () => {
    expect(_readNonNegativeAmount('-1')).toBeNull();
    expect(_readNonNegativeAmount('')).toBeNull();
  });
});

describe('mmUtils - _cleanText', () => {
  it('limpia', () => {
    expect(_cleanText('  hello  ')).toBe('hello');
    expect(_cleanText('hello', 10)).toBe('hello');
  });
  it('excede maxLength', () => {
    expect(() => _cleanText('hello world', 5)).toThrow('TEXT_TOO_LONG');
  });
  it('null/undefined', () => {
    expect(_cleanText(null as any)).toBe('');
    expect(_cleanText(undefined as any)).toBe('');
  });
});

describe('mmUtils - _stableSerialize', () => {
  it('orden estable', () => {
    expect(_stableSerialize({ b: 2, a: 1 })).toBe(_stableSerialize({ a: 1, b: 2 }));
  });
  it('primitivos', () => {
    expect(_stableSerialize(null)).toBe('null');
    expect(_stableSerialize(42)).toBe('42');
  });
});

describe('mmUtils - _looksLikeGuid', () => {
  it('validos', () => {
    expect(_looksLikeGuid('12345678-1234-4123-9234-123456789012')).toBe(true);
  });
  it('invalidos', () => {
    expect(_looksLikeGuid('')).toBe(false);
    expect(_looksLikeGuid('not-a-guid')).toBe(false);
    expect(_looksLikeGuid('12345678-1234-1234-1234-123456789012')).toBe(false);
    expect(_looksLikeGuid(null as any)).toBe(false);
  });
});

describe('mmUtils - _generateUUID', () => {
  it('v4 validos', () => {
    for (let i = 0; i < 50; i++) {
      expect(_generateUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
  it('unicos', () => {
    const set = new Set(Array.from({ length: 500 }, () => _generateUUID()));
    expect(set.size).toBe(500);
  });
});

describe('mmUtils - _hashKey', () => {
  it('deterministico', () => {
    expect(_hashKey('test')).toBe(_hashKey('test'));
  });
  it('diferentes', () => {
    expect(_hashKey('a')).not.toBe(_hashKey('b'));
  });
  it('hex 16 chars', () => {
    expect(_hashKey('test')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('mmUtils - _cloneDeep', () => {
  it('profundo', () => {
    const o = { a: { b: 1 }, c: [1, 2] };
    const cl = _cloneDeep(o);
    expect(cl).toEqual(o);
    expect(cl).not.toBe(o);
    expect(cl.a).not.toBe(o.a);
  });
  it('primitivos', () => {
    expect(_cloneDeep(null)).toBeNull();
    expect(_cloneDeep(42)).toBe(42);
  });
});

describe('mmUtils - _extractRelationalId', () => {
  it('varios formatos', () => {
    expect(_extractRelationalId({ _id: 'a' })).toBe('a');
    expect(_extractRelationalId({ id: 'b' })).toBe('b');
    expect(_extractRelationalId('c')).toBe('c');
  });
  it('null', () => {
    expect(_extractRelationalId(null)).toBe('');
    expect(_extractRelationalId(undefined)).toBe('');
  });
});

describe('mmSecrets.js - Integridad', () => {
  it('SECRETS frozen', () => {
    expect(Object.isFrozen(SECRETS)).toBe(true);
  });
  it('sin espacios', () => {
    for (const v of Object.values(SECRETS)) {
      expect(v).toBe(v.trim());
      expect(v).not.toMatch(/\s/);
    }
  });
  it('UPPER_SNAKE_CASE', () => {
    for (const v of Object.values(SECRETS)) {
      expect(v).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });
  it('secretos criticos', () => {
    expect(SECRETS.FISCAL_KEY).toBe('SECRETOFISCALKEY');
    expect(SECRETS.AUTH_JWT_KEY).toBe('SECRETO_AUTH_JWT_KEY');
    expect(SECRETS.M365_WEBHOOK_HMAC_KEY).toBe('SECRETO_M365_WEBHOOK_HMAC_KEY');
  });
  it('20 secretos', () => {
    expect(Object.keys(SECRETS)).toHaveLength(20);
  });
  it('sin vacios', () => {
    for (const v of Object.values(SECRETS)) {
      expect(v).not.toBe('');
    }
  });
});

describe('data.js - Protecciones', () => {
  it('MovimientosCaja update viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.MovimientosCaja_beforeUpdate({} as any)).toThrow('FISCAL_VIOLATION');
  });
  it('MovimientosCaja remove viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.MovimientosCaja_beforeRemove({} as any)).toThrow('FISCAL_VIOLATION');
  });
  it('HistoricoCierresZ update viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.HistoricoCierresZ_beforeUpdate({} as any)).toThrow('FISCAL_VIOLATION');
  });
  it('HistoricoCierresZ remove viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.HistoricoCierresZ_beforeRemove({} as any)).toThrow('FISCAL_VIOLATION');
  });
  it('RegistrosHorarios update viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.RegistrosHorariosStaff_beforeUpdate({} as any)).toThrow('LABOR_LOG_VIOLATION');
  });
  it('RegistrosHorarios remove viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.RegistrosHorariosStaff_beforeRemove({} as any)).toThrow('LABOR_LOG_VIOLATION');
  });
  it('CajaActual remove protegido', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.CajaActual_beforeRemove({} as any)).toThrow('SINGLETON_PROTECTED');
  });
  it('sin hooks legacy', async () => {
    const m = await import('../src/backend/data.js');
    expect((m as any).MOVIMIENTOS_CAJA_beforeInsert).toBeUndefined();
    expect((m as any).CIERRES_Z_beforeUpdate).toBeUndefined();
  });
});

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
  it('si COMPLEMENTOS_CATALOGO', () => {
    expect((COLLECTIONS as any).COMPLEMENTOS_CATALOGO).toBe('ComplementosCatalogo');
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
