// tests/contractFixes.test.js
// Regression coverage for the contract fixes applied during full debugging:
// 1. rescheduleBookingElevated (was imported by citasManager.web.js but not exported)
// 2. _projectWriterSlotFromAvailability (same)
// 3. requireMarianManager in backend/security
// 4. getInventoryReconciliationQueue in backend/inventario.web
// 5. getMyStaffContext in backend/horario.web
// 6. crons.js now imports from backend/bookingServiceSync (singular)
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('wix-bookings.v2', () => ({
  bookings: {
    createBooking: vi.fn(),
    cancelBooking: vi.fn(),
    confirmBooking: vi.fn(),
    declineBooking: vi.fn(),
    rescheduleBooking: vi.fn(),
  },
}));

vi.mock('wix-ecom-backend', () => ({
  checkout: {
    createCheckout: vi.fn(),
    getCheckoutUrl: vi.fn(),
  },
  orders: {
    getOrder: vi.fn(),
  },
}));

vi.mock('wix-auth', () => ({
  elevate: vi.fn((fn) => async (...args) => fn(...args)),
}));

vi.mock('wix-data', () => ({
  default: {
    query: vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(() => ({ find: vi.fn() })), ne: vi.fn(() => ({ find: vi.fn() })), limit: vi.fn(() => ({ find: vi.fn() })), find: vi.fn() })),
      ne: vi.fn(() => ({ find: vi.fn() })),
      descending: vi.fn(() => ({ limit: vi.fn(() => ({ find: vi.fn() })) })),
      limit: vi.fn(() => ({ find: vi.fn() })),
      find: vi.fn(),
    })),
    get: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('wix-members-backend', () => ({
  currentMember: {
    getMember: vi.fn(() => Promise.resolve({ _id: 'member-1', loginEmail: 'staff@example.com', roles: [] })),
  },
}));

vi.mock('wix-secrets-backend', () => ({
  getSecret: vi.fn(async (key) => {
    const secrets = {
      ADMIN_EMAILS: 'admin@example.com',
      CAJERO_EMAILS: 'cajero@example.com',
      SECRET_AUTH_JWT_KEY: 'mock-jwt-key',
      POWER_AUTOMATE_TOKEN: 'm365-secret',
    };
    return secrets[key] || '';
  }),
}));

vi.mock('wix-web-module', () => ({
  webMethod: vi.fn((_permission, handler) => handler),
  Permissions: {
    SiteMember: 'SITE_MEMBER',
    Admin: 'ADMIN',
    Anyone: 'ANYONE',
  },
}));
vi.mock('wix-http-functions', () => ({
  ok: vi.fn((options) => ({ status: 200, ...options })),
  badRequest: vi.fn((options) => ({ status: 400, ...options })),
  unauthorized: vi.fn((options) => ({ status: 401, ...options })),
  serverError: vi.fn((options) => ({ status: 500, ...options })),
}));

vi.mock('backend/booking/bookingSaga', () => ({
  executeBookingSaga: vi.fn(async () => ({ status: 'SUCCESS', data: null, error: null })),
}));

vi.mock('backend/cajas.web', () => ({
  registerBookingPayment: vi.fn(),
  queueFiscalRecovery: vi.fn(),
}));

vi.mock('backend/security', () => ({
  requireAdmin: vi.fn(),
  requireMarianManager: vi.fn(),
  isAdmin: vi.fn(),
  rateLimiter: vi.fn(() => ({ allowed: true })),
}));

vi.mock('backend/responseUtils', () => ({
  _toPublicError: vi.fn((error, code) => ({ code, message: error?.message })),
}));

vi.mock('backend/reservas.web', () => ({
  getServiceForBookingInternal: vi.fn(),
  _invalidateCachesInternal: vi.fn(),
  revalidateExactAvailabilitySlot: vi.fn(),
}));

vi.mock('backend/staff', () => ({
  findStaff: vi.fn(async () => ({
    resourceId: '22222222-2222-2222-2222-222222222222',
    displayName: 'Test Staff',
    scheduleId: '33333333-3333-3333-3333-333333333333',
    email: 'staff@example.com',
    idMiembroStaff: 'member-1',
  })),
}));

vi.mock('backend/internalConfig', () => ({
  COLLECTIONS: {
    CITAS: 'CitasF2',
    COMPENSATIONS: 'PendingCompensations',
    TRANSACTIONS: 'BookingTransactions',
    LOCKS: "SlotLocks",
    SERVICIOS_RESERVA: "ServiciosCatalogo",
    INVENTARIO_PRODUCTO: "InventarioStockVenta",
    MOVIMIENTO_INVENTARIO: "MovimientosInventario",
    CONCILIACION_STOCK_WIX: "MovimientosInventario",
    REGISTRO_HORARIO: "RegistrosHorariosStaff",
  },
  CONCURRENCY: { HEARTBEAT_MS: 15000, MUTEX_TTL_MS: 120000 },
  SDK_CONFIG: {
    TZ: 'Europe/Madrid',
    LOCATION_ID: '7a12abfd-bf30-4847-bcdf-00dc573d4802',
    LOCATION_TYPES: { TIME_SLOTS: 'BUSINESS', BOOKINGS_WRITER: 'OWNER_BUSINESS' },
    TIMEOUTS: { API_MS: 15000 },
    RATE_LIMIT: {},
  },
  TIPO_FICHAJE: { ENTRADA: 'ENTRADA', SALIDA: 'SALIDA', PAUSA_INICIO: 'PAUSA_INICIO', PAUSA_FIN: 'PAUSA_FIN', AJUSTE: 'AJUSTE' },
  COLLAB_ROLES: { ADMIN: 'ADMIN', GESTION: 'GESTION', ESTILISTA: 'ESTILISTA' },
}));

describe('Contratos de reschedule en bookingCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expone rescheduleBookingElevated y delega en bookings.rescheduleBooking', async () => {
    const { rescheduleBookingElevated } = await import('../src/backend/booking/bookingCore.js');
    const { bookings } = await import('wix-bookings.v2');
    bookings.rescheduleBooking.mockResolvedValue({ booking: { _id: 'bk-1', revision: 3 } });

    const result = await rescheduleBookingElevated('bk-1', {
      serviceId: '11111111-1111-1111-1111-111111111111',
      startDate: new Date('2026-09-03T08:00:00Z'),
      endDate: new Date('2026-09-03T08:30:00Z'),
      resource: { _id: '22222222-2222-2222-2222-222222222222' },
    }, { revision: '2' });

    expect(result).toMatchObject({ ok: true, booking: { _id: 'bk-1', revision: 3 } });
    expect(bookings.rescheduleBooking).toHaveBeenCalledTimes(1);
    expect(bookings.rescheduleBooking).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: 'bk-1',
      revision: '2',
    }));
  });

  it('proyecta un slot de availability al formato Writer V2', async () => {
    const { _projectWriterSlotFromAvailability } = await import('../src/backend/booking/bookingCore.js');
    const slot = {
      serviceId: '11111111-1111-1111-1111-111111111111',
      scheduleId: '33333333-3333-3333-3333-333333333333',
      localStartDate: '2026-09-03T10:00:00',
      localEndDate: '2026-09-03T10:30:00',
    };

    const result = await _projectWriterSlotFromAvailability(
      slot,
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111'
    );

    expect(result).toMatchObject({
      serviceId: '11111111-1111-1111-1111-111111111111',
      scheduleId: '33333333-3333-3333-3333-333333333333',
    });
    expect(result.resource).toEqual({ _id: '22222222-2222-2222-2222-222222222222' });
    expect(result.startDate).toBeInstanceOf(Date);
    expect(result.endDate).toBeInstanceOf(Date);
  });

  it('rechaza slot de reschedule con fechas invalidas', async () => {
    const { _projectWriterSlotFromAvailability } = await import('../src/backend/booking/bookingCore.js');
    const result = await _projectWriterSlotFromAvailability(
      { serviceId: '11111111-1111-1111-1111-111111111111', localStartDate: 'nope' },
      '22222222-2222-2222-2222-222222222222',
      '11111111-1111-1111-1111-111111111111'
    );
    expect(result).toBeNull();
  });
});

describe('Contrato del facade de reservas', () => {
  it('acepta primaryServiceId en metaCita y delega en el saga', async () => {
    const { processDualBooking } = await import('../src/backend/citasManager.web.js');
    const { executeBookingSaga } = await import('backend/booking/bookingSaga');

    const payload = {
      cliente: { email: 'cliente@example.com' },
      metaCita: {
        primaryServiceId: '11111111-1111-4111-8111-111111111111',
      },
      slotF1: {
        localStartDate: '2026-09-04T10:00:00',
      },
    };

    await processDualBooking(payload);

    expect(executeBookingSaga).toHaveBeenCalledWith(expect.objectContaining({
      metaCita: expect.objectContaining({
        serviceId: '11111111-1111-4111-8111-111111111111',
      }),
    }));
  });
});

describe('Contratos de seguridad, inventario y horario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expone requireMarianManager en backend/security', async () => {
    const mod = await import('../src/backend/security.js');
    expect(typeof mod.requireMarianManager).toBe('function');
  });

  it('expone getInventoryReconciliationQueue en inventario.web', async () => {
    const mod = await import('../src/backend/inventario.web.js');
    expect(typeof mod.getInventoryReconciliationQueue).toBe('function');
  });

  it('expone getMyStaffContext en horario.web', async () => {
    const mod = await import('../src/backend/horario.web.js');
    expect(typeof mod.getMyStaffContext).toBe('function');
  });
  it('valida el webhook M365 con el secreto de Secrets Manager', async () => {
    const { post_webhook_m365 } = await import('../src/backend/http-functions.js');
    const { hmacSha256Hex } = await import('../src/backend/securityEngine.js');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ eventType: 'LEDGER_MOVEMENT' });
    const signature = hmacSha256Hex('m365-secret', `${timestamp}.${body}`);

    const result = await post_webhook_m365({
      headers: { 'x-mm-signature': signature, 'x-mm-timestamp': timestamp },
      body,
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ received: true, eventType: 'LEDGER_MOVEMENT' });
  });

  it('propaga los fallos de persistencia del inventario online', async () => {
    const { recordOnlineInventoryOrderInternal } = await import('../src/backend/inventario.web.js');
    const wixData = await import('wix-data');
    const query = {
      eq: vi.fn(),
      limit: vi.fn(),
      find: vi.fn(),
    };
    query.eq.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.find.mockResolvedValue({ items: [{ _id: 'product-1', sku: 'SKU-1', stockActual: 4 }] });
    wixData.default.query.mockReturnValue(query);
    wixData.default.insert.mockRejectedValue(new Error('inventory write failed'));

    await expect(recordOnlineInventoryOrderInternal({ _id: 'order-1', lineItems: [{ sku: 'SKU-1', quantity: 1 }] }, 'trace-1'))
      .rejects.toThrow('inventory write failed');
    expect(wixData.default.update).not.toHaveBeenCalled();
  });
});

describe('Contrato de crons con bookingServiceSync', () => {
  it('crons.js importa desde bookingServiceSync (singular) sin romper el modulo', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/backend/crons.js', import.meta.url), 'utf8');
    expect(src).toContain('from "backend/bookingServiceSync"');
    expect(src).not.toContain('from "backend/bookingsServiceSync"');
  });
});
