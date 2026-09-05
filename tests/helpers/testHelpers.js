// Reusable fixtures and timing helpers for functional tests.

export function createMockSlot(overrides = {}) {
  return {
    primaryServiceGuid: '11111111-1111-1111-1111-111111111111',
    serviceId: '11111111-1111-1111-1111-111111111111',
    resourceId: '22222222-2222-2222-2222-222222222222',
    scheduleId: '33333333-3333-3333-3333-333333333333',
    localStartDate: '2026-09-03T10:00:00',
    localEndDate: '2026-09-03T10:30:00',
    ...overrides,
  };
}

export function createMockService(overrides = {}) {
  return {
    serviceId: '11111111-1111-1111-1111-111111111111',
    title: 'Test Service',
    phase1Duration: 30,
    exposureDuration: 0,
    phase2Duration: 0,
    totalDuration: 30,
    price: 50,
    ...overrides,
  };
}

export function createMockCita(overrides = {}) {
  return {
    bookingId: 'mock-booking-id',
    serviceId: '11111111-1111-1111-1111-111111111111',
    resourceId: '22222222-2222-2222-2222-222222222222',
    startDate: new Date('2026-09-03T10:00:00Z'),
    endDate: new Date('2026-09-03T10:30:00Z'),
    status: 'CONFIRMED',
    paymentStatus: 'UNPAID',
    ...overrides,
  };
}

export function createMockMovimiento(overrides = {}) {
  return {
    _id: 'mock-movimiento-id',
    prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
    previousRecordHash: '0000000000000000000000000000000000000000000000000000000000000000',
    transactionId: 'TX-001',
    tipoMovimiento: 'VENTA_EFECTIVO',
    movementType: 'VENTA_EFECTIVO',
    importeContable: 50,
    accountingAmount: 50,
    formaPago: 'EFECTIVO',
    paymentMethod: 'EFECTIVO',
    integrityPayloadVersion: 'LEDGER_V1',
    ...overrides,
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mockFindStaff(resourceId) {
  return {
    resourceId,
    nombreVisible: 'Test Staff',
    scheduleId: '33333333-3333-3333-3333-333333333333',
    email: 'staff@example.com',
  };
}
