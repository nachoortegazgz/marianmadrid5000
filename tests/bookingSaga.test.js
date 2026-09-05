// tests/bookingSaga.test.js — Tests dinámicos para bookingSaga
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de dependencias
vi.mock('wix-bookings.v2', () => ({
  bookings: {
    createBooking: vi.fn(),
    cancelBooking: vi.fn(),
  }
}));

vi.mock('wix-ecom-backend', () => ({
  checkout: {
    createCheckout: vi.fn(),
  }
}));

vi.mock('wix-auth', () => ({
  elevate: vi.fn((fn) => fn())
}));

vi.mock('wix-data', () => ({
  default: {
    query: vi.fn(() => ({
      eq: vi.fn(() => ({
        ne: vi.fn(() => ({ find: vi.fn() })),
        find: vi.fn()
      })),
      find: vi.fn()
    })),
    insert: vi.fn(),
    update: vi.fn(),
  }
}));

vi.mock('backend/staff', () => ({
  findStaff: vi.fn()
}));

vi.mock('backend/internalConfig', () => ({
  COLLECTIONS: {
    CITAS: 'CitasF2',
    COMPENSATIONS: 'PendingCompensations',
    TRANSACTIONS: 'Transactions',
    LOCKS: 'SlotLocks',
  },
  CONCURRENCY: {
    HEARTBEAT_MS: 15000,
    MUTEX_TTL_MS: 120000,
  },
  SDK_CONFIG: {
    TIMEOUTS: { API_MS: 15000 }
  }
}));

vi.mock('public/mmUtils', () => ({
  _safeTrim: (str) => str ? String(str).trim() : '',
  _looksLikeGuid: (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str),
  getUtcDateFromMadridLocal: vi.fn((date) => date),
  getMadridLocalStringNoZ: (date) => date.toISOString().replace('Z', ''),
  makeTraceId: vi.fn(() => 'trace-' + Date.now()),
  _toDateSafe: vi.fn((val) => new Date(val)),
  _hashKey: vi.fn((str) => 'hash-' + str),
  withTimeout: (promise) => Promise.resolve(promise),
}));

vi.mock('backend/securityEngine', () => ({
  hashSHA256: vi.fn((str) => 'hash_' + str.substring(0, 16))
}));

vi.mock('backend/reservas.web', () => ({
  _getServiceBySlugOrIdInternal: vi.fn(),
  _resolveStaffForSlotInternal: vi.fn(),
  _resolvePrimaryServiceIdInternal: vi.fn(),
  _invalidateCachesInternal: vi.fn()
}));

describe('bookingSaga - Integración Dinámica', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe cargar la saga con sus helpers internos disponibles', async () => {
    const saga = await import('../src/backend/booking/bookingSaga.js');
    expect(typeof saga.executeBookingSaga).toBe('function');
  });

  it('debe normalizar meta serializada para reintentos online', async () => {
    const { _normalizePersistedMeta } = await import('../src/backend/booking/bookingSaga.js');
    expect(_normalizePersistedMeta('{"estadoPago":"PENDING_PAYMENT","checkoutId":"co-1"}'))
      .toEqual({ estadoPago: 'PENDING_PAYMENT', checkoutId: 'co-1' });
    expect(_normalizePersistedMeta({ esCombinado: true })).toEqual({ esCombinado: true });
    expect(_normalizePersistedMeta('invalid')).toEqual({});
  });

  it('debe validar estructura de ERROR_CODES', async () => {
    const { ERROR_CODES } = await import('../src/backend/booking/bookingCore.js');
    expect(ERROR_CODES).toBeDefined();
    expect(typeof ERROR_CODES.INVALID_PAYLOAD).toBe('string');
    expect(typeof ERROR_CODES.TOKEN_BUSY).toBe('string');
    expect(typeof ERROR_CODES.BOOKING_CREATION_FAILED).toBe('string');
  });

  it('debe crear errores con estructura correcta', async () => {
    const { createBookingError } = await import('../src/backend/booking/bookingCore.js');
    const error = createBookingError('TEST_CODE', 'Test error message', { extra: 'data' });
    
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test error message');
    expect(error.details).toEqual({ extra: 'data' });
    expect(error.isBookingError).toBe(true);
    expect(error.timestamp).toBeDefined();
  });

  it('debe normalizar addons correctamente', async () => {
    const { _normalizeAddons } = await import('../src/backend/booking/bookingCore.js');
    
    const input = [
      { id: '  addon1  ', name: '  Servicio Extra  ', price: '25.50', quantity: '2' },
      { id: 'addon2', name: 'Producto', price: 10, quantity: 3 },
    ];
    
    const result = _normalizeAddons(input);
    
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('addon1');
    expect(result[0].name).toBe('Servicio Extra');
    expect(result[0].price).toBe(25.50);
    expect(result[0].quantity).toBe(2);
    expect(result[1].price).toBe(10);
    expect(result[1].quantity).toBe(3);
  });

  it('debe sumar addons correctamente', async () => {
    const { _sumAddons } = await import('../src/backend/booking/bookingCore.js');
    
    const addons = [
      { price: 100, quantity: 1 },
      { price: 50, quantity: 2 },
      { price: 25.50, quantity: 3 },
    ];
    
    const total = _sumAddons(addons);
    expect(total).toBe(276.50); // 100*1 + 50*2 + 25.50*3
  });

  it('debe manejar slot válido con staff assignment', async () => {
    const { _forceStaffInPristineSlot } = await import('../src/backend/booking/bookingCore.js');
    
    const slot = {
      serviceId: '11111111-1111-1111-1111-111111111111',
      scheduleId: '22222222-2222-2222-2222-222222222222',
      localStartDate: '2026-09-02T10:00:00',
    };
    
    const result = await _forceStaffInPristineSlot(slot, '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 45);
    
    expect(result).toBeDefined();
    expect(result.resourceId).toBe('33333333-3333-3333-3333-333333333333');
    expect(result.localEndDate).toBeDefined();
    expect(result.scheduleId).toBe(slot.scheduleId);
  });

  it('resuelve el serviceId desde el slot con la firma legacy de 3 argumentos (forma de llamada del saga)', async () => {
    const { _forceStaffInPristineSlot } = await import('../src/backend/booking/bookingCore.js');
    
    const slot = {
      serviceId: '11111111-1111-1111-1111-111111111111',
      scheduleId: '22222222-2222-2222-2222-222222222222',
      resourceId: '44444444-4444-4444-4444-444444444444',
      localStartDate: '2026-09-02T10:00:00',
    };
    
    const result = await _forceStaffInPristineSlot(slot, '33333333-3333-3333-3333-333333333333', 45);
    
    expect(result).toBeDefined();
    expect(result.serviceId).toBe('11111111-1111-1111-1111-111111111111');
    expect(result.resourceId).toBe('33333333-3333-3333-3333-333333333333');
    expect(result.localEndDate).toBeDefined();
  });

  it('debe rechazar slot sin localStartDate', async () => {
    const { _forceStaffInPristineSlot } = await import('../src/backend/booking/bookingCore.js');
    
    const slot = { resourceId: 'abc' };
    const result = await _forceStaffInPristineSlot(slot, 'res-1', 30);
    
    expect(result).toBeNull();
  });

  it('debe manejar transacciones correctamente', async () => {
    const { _initTransaction, _completeTransaction, _failTransaction } = await import('../src/backend/booking/bookingCore.js');
    
    // Mock de wixData.insert para init
    const wixData = await import('wix-data');
    wixData.default.insert.mockResolvedValue({ _id: 'tx_test123' });
    
    const initResult = await _initTransaction('pair_123', 'trace_456');
    expect(initResult.ok).toBe(true);
    expect(initResult.transactionId).toBeDefined();
  });

  it('debe validar GUIDs correctamente', async () => {
    const { _looksLikeGuid } = await import('public/mmUtils');
    
    expect(_looksLikeGuid('11111111-1111-1111-1111-111111111111')).toBe(true);
    expect(_looksLikeGuid('invalid-guid')).toBe(false);
    expect(_looksLikeGuid('')).toBe(false);
    expect(_looksLikeGuid(null)).toBe(false);
  });

  it('debe hacer trim seguro de strings', async () => {
    const { _safeTrim } = await import('public/mmUtils');
    
    expect(_safeTrim('  hello  ')).toBe('hello');
    expect(_safeTrim('')).toBe('');
    expect(_safeTrim(null)).toBe('');
    expect(_safeTrim(undefined)).toBe('');
  });

  it('_extractCheckoutId extrae el checkoutId del envelope de createCheckoutElevated', async () => {
    const { _extractCheckoutId } = await import('../src/backend/booking/bookingSaga.js');

    // Contrato actual: createCheckoutElevated devuelve { ok, data: { checkoutId, status } }
    expect(_extractCheckoutId({ ok: true, data: { checkoutId: 'co-123', status: 'APPROVED' } }))
      .toBe('co-123');
    // Shapes legacy/raw soportados
    expect(_extractCheckoutId({ checkout: { _id: 'co-raw' } })).toBe('co-raw');
    expect(_extractCheckoutId({ _id: 'co-legacy' })).toBe('co-legacy');
    // Fracaso del checkout: no debe lanzar, debe devolver null
    expect(_extractCheckoutId({ ok: false, code: 'CHECKOUT_FAILED', message: 'boom' })).toBeNull();
    expect(_extractCheckoutId(null)).toBeNull();
  });

  it('_compensateCreatedBookings cancela los bookings creados en Wix', async () => {
    const { bookings } = await import('wix-bookings.v2');
    const wixData = await import('wix-data');
    const { _compensateCreatedBookings } = await import('../src/backend/booking/bookingSaga.js');

    bookings.cancelBooking.mockResolvedValue({});
    await _compensateCreatedBookings([
      { bookingId: 'b1', revision: 1, phase: { key: 'F1' } }
    ], 'trace-1');

    expect(bookings.cancelBooking).toHaveBeenCalledWith({
      bookingId: 'b1',
      revision: 1,
      flowControlSettings: { ignoreCancellationPolicy: true }
    });
    // Cancelacion OK: no se registra compensacion pendiente
    expect(wixData.default.insert).not.toHaveBeenCalled();
  });

  it('_compensateCreatedBookings registra PENDING si la cancelacion falla (no lanza)', async () => {
    const { bookings } = await import('wix-bookings.v2');
    const wixData = await import('wix-data');
    const { _compensateCreatedBookings } = await import('../src/backend/booking/bookingSaga.js');

    // cancelBookingElevated captura el error y devuelve { ok:false } (nunca lanza)
    bookings.cancelBooking.mockRejectedValue(new Error('network'));
    wixData.default.insert.mockResolvedValue({ _id: 'comp-1' });

    await _compensateCreatedBookings([
      { bookingId: 'b2', revision: 2, phase: { key: 'F2' } }
    ], 'trace-2');

    expect(wixData.default.insert).toHaveBeenCalledWith(
      'PendingCompensations',
      { bookingId: 'b2', phase: 'F2', status: 'PENDING', attempts: 0, traceId: 'trace-2' },
      { suppressAuth: true }
    );
  });
});
