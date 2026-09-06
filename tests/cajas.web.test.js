import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash as nodeCreateHash, createHmac as nodeCreateHmac } from 'node:crypto';

const GENESIS_HASH = '0'.repeat(64);
const hashSHA256 = (i) => nodeCreateHash('sha256').update(String(i || '')).digest('hex');
const hashChain = (p, payload) => hashSHA256((p || GENESIS_HASH) + '|' + payload);
const hmacSha256Hex = (k, p) => nodeCreateHmac('sha256', String(k || '')).update(String(p || '')).digest('hex');

function stableSerialize(value) {
  if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']';
  if (value && typeof value === 'object') {
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stableSerialize(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

vi.mock('wix-web-module', () => ({
  webMethod: vi.fn((_p, h) => h),
  Permissions: { Anyone: 'ANYONE', SiteMember: 'SITE_MEMBER', Admin: 'ADMIN' },
}));

vi.mock('wix-secrets-backend', () => ({
  getSecret: vi.fn(async (key) => {
    return { SECRET_FISCAL_KEY: 'fiscal-key-32-chars-minimum-length-000', FISCAL_NIF_EMISOR: 'B50000000' }[key] || '';
  }),
}));

vi.mock('backend/security', () => ({
  requireCajero: vi.fn(async () => true),
  requireAdmin: vi.fn(async () => true),
  rateLimiter: vi.fn(() => ({ allowed: true })),
}));

vi.mock('backend/securityEngine', () => ({
  hashSHA256, hashChain, hmacSha256Hex,
  timingSafeEqual: vi.fn((a, b) => String(a) === String(b)),
}));

vi.mock('public/mmUtils', () => ({
  makeTraceId: vi.fn((pfx) => 'trace-' + pfx + '-' + Date.now()),
  _safeTrim: (v) => (v == null ? '' : String(v).trim()),
  _cleanText: (v, max = 500) => String(v ?? '').trim().slice(0, max),
  _stableSerialize: stableSerialize,
  _normalizeIdPart: (v, max) => String(v ?? '').slice(0, max),
  _readDate: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim()) ? String(v).trim() : null),
  _readPositiveAmount: (val) => { const n = Number(val); return Number.isFinite(n) && n > 0 ? n : null; },
  _readNonNegativeAmount: (val) => { const n = Number(val); return Number.isFinite(n) && n >= 0 ? n : null; },
  _roundMoney: (val) => { const n = Number(val); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; },
}));

vi.mock('backend/mmSecrets', () => ({
  SECRETS: { FISCAL_KEY: 'SECRET_FISCAL_KEY', FISCAL_NIF_EMISOR: 'FISCAL_NIF_EMISOR' },
}));

vi.mock('backend/booking/bookingCore', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  normalizeError: vi.fn((e) => ({ code: e?.code || 'ERROR', message: e?.message || String(e) })),
}));

vi.mock('backend/responseUtils', () => ({
  _toPublicError: vi.fn((e, c) => ({ code: c || e?.code || 'ERROR', message: e?.message || String(e) })),
}));

vi.mock('backend/internalConfig', () => ({
  COLLECTIONS: {
    SECUENCIA_TICKETS: 'SecuenciaTickets', MOVIMIENTOS_CAJA: 'MovimientosCaja',
    CAJA_ACTUAL: 'CajaActual', CIERRES_Z: 'HistoricoCierresZ',
    COMPENSACIONES_PENDIENTES: 'CompensacionesPendientes', MM_AUDIT_LOG: 'MmAuditLog',
  },
  SINGLETONS: { CAJA: 'CAJA_PRINCIPAL' },
  SDK_CONFIG: { TZ: 'Europe/Madrid', M365: { ENABLED: false }, ACCOUNTING: { ENABLED: false } },
  TIPO_MOVIMIENTO: {
    VENTA_EFECTIVO: 'VENTA_EFECTIVO', VENTA_TARJETA: 'VENTA_TARJETA', VENTA_BIZUM: 'VENTA_BIZUM',
    VENTA_ONLINE: 'VENTA_ONLINE', REEMBOLSO: 'REEMBOLSO', AJUSTE: 'AJUSTE', PROPINA: 'PROPINA',
  },
  FORMA_PAGO: { EFECTIVO: 'EFECTIVO', TARJETA: 'TARJETA', BIZUM: 'BIZUM', ONLINE: 'ONLINE' },
  IVA_RATES: { GENERAL: 0.21, REDUCIDO: 0.1, SUPERREDUCIDO: 0.04, EXENTO: 0 },
  CAJA_STATUS: { OPEN: 'ABIERTA', CLOSED: 'CERRADA' },
}));

vi.mock('wix-data', () => {
  const makeChain = () => {
    const chain = {};
    const self = () => chain;
    chain.eq = self; chain.ne = self; chain.ascending = self; chain.descending = self;
    chain.limit = self; chain.skip = self;
    chain.find = vi.fn(async () => ({ items: [], hasNext: () => false }));
    return chain;
  };
  return {
    default: {
      query: vi.fn(() => makeChain()),
      get: vi.fn(async () => null),
      insert: vi.fn(async (_c, item) => ({ ...item, _id: item._id || 'mock-id' })),
      update: vi.fn(async (_c, item) => item),
      save: vi.fn(async (_c, item) => item),
    },
  };
});

const VALID_PAYLOAD = { amount: 25.5, paymentMethod: 'EFECTIVO', concept: 'Venta mostrador', traceId: 'trace-caja-test' };

const getWixData = async () => await import('wix-data');
const getCajas = async () => await import('../src/backend/cajas.web.js');

describe('cajas.web', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('registerManualTransaction rechaza paymentMethod invalido', async () => {
    const { registerManualTransaction } = await getCajas();
    const res = await registerManualTransaction({ ...VALID_PAYLOAD, paymentMethod: 'CRIPTO' });
    expect(res.status).toBe('ERROR');
    expect(res.error.code).toBe('INVALID_PAYMENT_METHOD');
  });

  it('registerManualTransaction rechaza amount <= 0', async () => {
    const { registerManualTransaction } = await getCajas();
    const resZero = await registerManualTransaction({ ...VALID_PAYLOAD, amount: 0 });
    const resNeg = await registerManualTransaction({ ...VALID_PAYLOAD, amount: -5 });
    expect(resZero.status).toBe('ERROR');
    expect(resZero.error.code).toBe('INVALID_AMOUNT');
    expect(resNeg.error.code).toBe('INVALID_AMOUNT');
  });

  it('registerManualTransaction genera hash chain correcto', async () => {
    const { registerManualTransaction } = await getCajas();
    const wixData = await getWixData();
    wixData.default.get.mockImplementation(async (_col, id) =>
      id === 'GLOBAL' ? { _id: 'GLOBAL', sequenceCounters: { seqGlobal: 0, '2026': 0 } } : null
    );
    const res = await registerManualTransaction(VALID_PAYLOAD);
    expect(res.status).toBe('SUCCESS');
    const inserted = wixData.default.insert.mock.calls.find(([col]) => col === 'MovimientosCaja');
    expect(inserted).toBeDefined();
    const mov = inserted[1];
    expect(mov.previousRecordHash).toBe(GENESIS_HASH);
    expect(mov.sequenceNumber).toBe(1);
    expect(mov.paymentMethod).toBe('EFECTIVO');
    expect(mov.totalAmount).toBe(25.5);
    const payloadStr = stableSerialize({
      previousRecordHash: GENESIS_HASH, sequenceNumber: 1, invoiceNumber: mov.invoiceNumber,
      operationDate: mov.operationDate, movementType: mov.movementType, paymentMethod: 'EFECTIVO',
      totalAmount: 25.5, taxableAmount: mov.taxableAmount, taxAmount: mov.taxAmount, taxRate: mov.taxRate,
    });
    expect(mov.currentRecordHash).toBe(hashChain(GENESIS_HASH, payloadStr));
  });

  it('registerBookingPayment delega a registerManualTransaction', async () => {
    const { registerBookingPayment } = await getCajas();
    const wixData = await getWixData();
    wixData.default.get.mockImplementation(async (_col, id) =>
      id === 'GLOBAL' ? { _id: 'GLOBAL', sequenceCounters: { seqGlobal: 0, '2026': 0 } } : null
    );
    const res = await registerBookingPayment('bk-1,bk-2', 50, 'ONLINE', { concept: 'Cobro reserva', traceId: 'trace-pay' });
    expect(res.status).toBe('SUCCESS');
    const inserted = wixData.default.insert.mock.calls.find(([col]) => col === 'MovimientosCaja');
    expect(inserted[1].paymentMethod).toBe('ONLINE');
    expect(inserted[1].movementType).toBe('VENTA_ONLINE');
    expect(inserted[1].reservationIdLinked).toBe('bk-1,bk-2');
  });

  it('queueFiscalRecovery registra PENDING_RECOVERY en CompensacionesPendientes', async () => {
    const { queueFiscalRecovery } = await getCajas();
    const wixData = await getWixData();
    await queueFiscalRecovery({ transactionId: 'TX-1', amount: 50, traceId: 'trace-rec' });
    const inserted = wixData.default.insert.mock.calls.find(([col]) => col === 'CompensacionesPendientes');
    expect(inserted).toBeDefined();
    expect(inserted[1].status).toBe('PENDING_RECOVERY');
    expect(inserted[1].kind).toBe('FISCAL_LEDGER');
    expect(inserted[1].transactionId).toBe('TX-1');
    expect(inserted[2]).toEqual({ suppressAuth: true });
  });

  it('verifyFiscalHashChainIntegrity detecta ruptura de cadena', async () => {
    const { verifyFiscalHashChainIntegrity } = await getCajas();
    const wixData = await getWixData();
    const broken = {
      items: [
        { _id: 'm1', invoiceNumber: 'FAC-2026-00001', previousRecordHash: GENESIS_HASH, currentRecordHash: 'a'.repeat(64) },
        { _id: 'm2', invoiceNumber: 'FAC-2026-00002', previousRecordHash: 'b'.repeat(64), currentRecordHash: 'c'.repeat(64) },
      ],
      hasNext: () => false,
    };
    wixData.default.query.mockReturnValue({
      ascending: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      find: vi.fn(async () => broken),
    });
    const res = await verifyFiscalHashChainIntegrity({ traceId: 'trace-audit' });
    expect(res.status).toBe('INTEGRITY_COMPROMISED');
    expect(res.data.breaksCount).toBe(1);
    expect(res.data.breaks[0].expected).toBe('a'.repeat(64));
    expect(res.data.breaks[0].actual).toBe('b'.repeat(64));
    const audit = wixData.default.insert.mock.calls.find(([col]) => col === 'MmAuditLog');
    expect(audit).toBeDefined();
    expect(audit[1].eventType).toBe('FISCAL_CHAIN_CORRUPTED');
    expect(audit[1].level).toBe('CRITICAL');
  });
});
