import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSlot, createMockService, createMockCita } from './helpers/testHelpers.js';

describe('Integracion - flujos criticos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completa una reserva simple con slot proyectado y booking creado', async () => {
    const { _forceStaffInPristineSlot, createBookingElevated } = await import('../src/backend/booking/bookingCore.js');
    const { bookings } = await import('wix-bookings.v2');
    const service = createMockService();
    const slot = createMockSlot({ primaryServiceGuid: service.serviceId });
    bookings.createBooking = vi.fn().mockResolvedValue({
      booking: { _id: 'booking-123', revision: 1 }
    });

    const pristineSlot = await _forceStaffInPristineSlot(
      slot,
      slot.resourceId,
      service.serviceId,
      service.tiempoFase1
    );
    const result = await createBookingElevated({
      serviceId: service.serviceId,
      bookedEntity: { slot: pristineSlot },
      contactDetails: { firstName: 'Test', email: 'test@example.com' },
      totalParticipants: 1,
    });

    expect(pristineSlot).toMatchObject({
      serviceId: service.serviceId,
      resourceId: slot.resourceId,
    });
    expect(result).toMatchObject({
      ok: true,
      data: { bookingId: 'booking-123', revision: 1 },
    });
    expect(bookings.createBooking).toHaveBeenCalledTimes(1);
  });

  it('confirma una reserva con estado de pago y revision', async () => {
    const { confirmOrDeclineBookingElevated } = await import('../src/backend/booking/bookingCore.js');
    const { bookings } = await import('wix-bookings.v2');
    bookings.confirmBooking = vi.fn().mockResolvedValue({ booking: createMockCita({ bookingId: 'booking-123' }) });

    const result = await confirmOrDeclineBookingElevated('booking-123', {
      paymentStatus: 'NOT_PAID',
      revision: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { bookingId: 'booking-123', status: 'CONFIRMED' },
    });
    expect(bookings.confirmBooking).toHaveBeenCalledWith({
      bookingId: 'booking-123',
      paymentStatus: 'NOT_PAID',
      revision: 1,
    });
  });

  it('calcula correctamente el total auditado del ledger', async () => {
    const { _auditBookingPrice } = await import('../src/backend/booking/bookingCore.js');

    expect(_auditBookingPrice(50, [
      { price: 12.5, quantity: 2 },
      { price: 5, quantity: 1 },
    ])).toBe(80);
  });
});
