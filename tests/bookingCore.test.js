// tests/bookingCore.test.js — Generado automáticamente
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock de dependencias externas
vi.mock('wix-bookings.v2', () => ({
  bookings: {
    createBooking: vi.fn(),
    cancelBooking: vi.fn(),
    confirmBooking: vi.fn(),
    declineBooking: vi.fn(),
  }
}));

vi.mock('wix-ecom-backend', () => ({
  checkout: {
    createCheckout: vi.fn(),
    getCheckoutUrl: vi.fn(),
  }
}));

vi.mock('wix-auth', () => ({
  elevate: vi.fn((fn) => fn())
}));

vi.mock('wix-data', () => ({
  default: {
    query: vi.fn(() => ({
      eq: vi.fn(() => ({
        ne: vi.fn(() => ({
          find: vi.fn()
        })),
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
    TIMEOUTS: {
      API_MS: 15000,
    }
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
}));

vi.mock('backend/securityEngine', () => ({
  hashSHA256: vi.fn((str) => 'hash_' + str.substring(0, 16))
}));

// Importar después de los mocks
import { 
  _forceStaffInPristineSlot, 
  _generateSlotKey,
  ERROR_CODES,
  createBookingError,
  _normalizeAddons,
  _sumAddons,
  _persistBooking,
  _handleError
} from '../src/backend/booking/bookingCore.js';

describe('bookingCore', () => {
  describe('_forceStaffInPristineSlot', () => {
    it('debe retornar null si falta localStartDate (validación de seguridad)', async () => {
      const slot = { resourceId: 'abc', scheduleId: 'def' };
      // La función ahora valida y retorna null si falta localStartDate
      const result = await _forceStaffInPristineSlot(slot, 'res-1', 30);
      expect(result).toBeNull();
    });

    it('debe proyectar slot con shape Writer V2 correcto', async () => {
      const slot = {
        primaryServiceGuid: '11111111-1111-1111-1111-111111111111',
        scheduleId: '22222222-2222-2222-2222-222222222222',
        localStartDate: '2026-09-02T10:00:00',
        localEndDate: '2026-09-02T10:30:00',
      };
      const result = await _forceStaffInPristineSlot(
        slot,
        '33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        30
      );
      expect(result).toMatchObject({
        resourceId: '33333333-3333-3333-3333-333333333333',
        scheduleId: '22222222-2222-2222-2222-222222222222',
      });
    });

    it('debe calcular localEndDate si no existe y se proporciona durationMinutes', async () => {
      const slot = {
        primaryServiceGuid: '11111111-1111-1111-1111-111111111111',
        scheduleId: '22222222-2222-2222-2222-222222222222',
        localStartDate: '2026-09-02T10:00:00',
      };
      const result = await _forceStaffInPristineSlot(
        slot, 
        '33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        30
      );
      expect(result?.localEndDate).toBeDefined();
    });
  });

  describe('ERROR_CODES', () => {
    it('debe tener todos los códigos de error definidos', () => {
      expect(ERROR_CODES.INVALID_PAYLOAD).toBe('INVALID_PAYLOAD');
      expect(ERROR_CODES.TOKEN_BUSY).toBe('TOKEN_BUSY');
      expect(ERROR_CODES.BOOKING_CREATION_FAILED).toBe('BOOKING_CREATION_FAILED');
      expect(ERROR_CODES.CHECKOUT_FAILED).toBe('CHECKOUT_FAILED');
    });
  });

  describe('createBookingError', () => {
    it('debe crear un error con código y mensaje', () => {
      const error = createBookingError('TEST_CODE', 'Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.message).toBe('Test message');
      expect(error.isBookingError).toBe(true);
    });

    it('debe incluir detalles opcionales', () => {
      const error = createBookingError('TEST_CODE', 'Test message', { extra: 'data' });
      expect(error.details).toEqual({ extra: 'data' });
    });
  });

  describe('_normalizeAddons', () => {
    it('debe retornar array vacío si addons es null o undefined', () => {
      expect(_normalizeAddons(null)).toEqual([]);
      expect(_normalizeAddons(undefined)).toEqual([]);
    });

    it('debe normalizar addons correctamente', () => {
      const addons = [
        { id: '  1  ', name: 'Addon 1', price: '10.5', quantity: '2' },
        { id: '2', name: 'Addon 2', price: 20, quantity: 1 },
      ];
      const result = _normalizeAddons(addons);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: '1', name: 'Addon 1', price: 10.5, quantity: 2 });
      expect(result[1]).toEqual({ id: '2', name: 'Addon 2', price: 20, quantity: 1 });
    });
  });

  describe('_sumAddons', () => {
    it('debe retornar 0 si addons es null o undefined', () => {
      expect(_sumAddons(null)).toBe(0);
      expect(_sumAddons(undefined)).toBe(0);
    });

    it('debe sumar correctamente el total de addons', () => {
      const addons = [
        { price: 10, quantity: 2 },
        { price: 15, quantity: 1 },
      ];
      expect(_sumAddons(addons)).toBe(35);
    });
  });

  describe('_persistBooking', () => {
    it('debe persistir el identificador canonico del servicio', async () => {
      const wixData = await import('wix-data');
      wixData.default.insert.mockResolvedValue({ _id: 'booking-1' });

      await _persistBooking({
        bookingId: 'booking-1',
        primaryServiceGuid: '11111111-1111-1111-1111-111111111111',
        scheduleId: '22222222-2222-2222-2222-222222222222',
        startDate: new Date('2026-09-03T10:00:00.000Z'),
        endDate: new Date('2026-09-03T10:30:00.000Z'),
        tipo: 'simple',
        meta: { estadoPago: 'PENDING_PAYMENT' }
      });

      expect(wixData.default.insert).toHaveBeenCalledWith(
        'CitasF2',
        expect.objectContaining({
          primaryServiceGuid: '11111111-1111-1111-1111-111111111111'
        })
      );
      expect(wixData.default.insert.mock.calls[0][1]).not.toHaveProperty('serviceId');
    });
  });

  describe('operaciones elevadas de booking', () => {
    it('debe conservar revision y opciones al cancelar', async () => {
      const wixBookings = await import('wix-bookings.v2');
      wixBookings.bookings.cancelBooking.mockResolvedValue({});
      const { cancelBookingElevated } = await import('../src/backend/booking/bookingCore.js');

      await cancelBookingElevated('booking-1', {
        revision: 3,
        flowControlSettings: { ignoreCancellationPolicy: true }
      });

      expect(wixBookings.bookings.cancelBooking).toHaveBeenCalledWith({
        bookingId: 'booking-1',
        revision: 3,
        flowControlSettings: { ignoreCancellationPolicy: true }
      });
    });

    it('debe confirmar cuando recibe opciones de pago', async () => {
      const wixBookings = await import('wix-bookings.v2');
      wixBookings.bookings.confirmBooking.mockResolvedValue({});
      const { confirmOrDeclineBookingElevated } = await import('../src/backend/booking/bookingCore.js');

      await confirmOrDeclineBookingElevated('booking-1', {
        paymentStatus: 'NOT_PAID',
        revision: 2
      });

      expect(wixBookings.bookings.confirmBooking).toHaveBeenCalledWith({
        bookingId: 'booking-1',
        paymentStatus: 'NOT_PAID',
        revision: 2
      });
    });

    it('debe declinar cuando recibe la accion explicitamente', async () => {
      const wixBookings = await import('wix-bookings.v2');
      wixBookings.bookings.declineBooking.mockResolvedValue({});
      const { confirmOrDeclineBookingElevated } = await import('../src/backend/booking/bookingCore.js');

      await confirmOrDeclineBookingElevated('booking-2', 'decline');

      expect(wixBookings.bookings.declineBooking).toHaveBeenCalledWith({
        bookingId: 'booking-2'
      });
    });

    it('debe mantener compatibilidad con la firma legacy de _forceStaffInPristineSlot', async () => {
      const slot = {
        primaryServiceGuid: '11111111-1111-1111-1111-111111111111',
        scheduleId: '22222222-2222-2222-2222-222222222222',
        localStartDate: '2026-09-02T10:00:00',
      };
      const { _forceStaffInPristineSlot } = await import('../src/backend/booking/bookingCore.js');

      const result = await _forceStaffInPristineSlot(
        slot,
        '33333333-3333-3333-3333-333333333333',
        30
      );

      expect(result).not.toBeNull();
      expect(result.resourceId).toBe('33333333-3333-3333-3333-333333333333');
      expect(result.localEndDate).toBeDefined();
    });
  });

  it('debe conservar el contexto estructurado del error', async () => {
    const result = await _handleError(new Error('fallo de prueba'), {
      surface: 'processDualBooking(wrapper)',
      traceId: 'trace-1'
    });

    expect(result.error.details).toMatchObject({
      surface: 'processDualBooking(wrapper)',
      traceId: 'trace-1'
    });
  });
});
