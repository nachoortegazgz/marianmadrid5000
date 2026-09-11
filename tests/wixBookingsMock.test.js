// tests/wixBookingsMock.test.js
// Regresion: garantiza el contrato del mock standalone de wix-bookings.v2
// (tests/mocks/wix-bookings.v2.js) frente al consumo real de
// src/backend/booking/bookingCore.js y src/backend/reservas.web.js.
import { describe, it, expect } from 'vitest';
import bookingsModule, {
  bookings,
  availabilityTimeSlots,
  getAvailability,
  createBooking,
  cancelBooking,
} from './mocks/wix-bookings.v2.js';

describe('Mock de wix-bookings.v2', () => {
  it('expone el contrato de bookings usado por bookingCore.js', () => {
    expect(typeof bookings.getAvailability).toBe('function');
    expect(typeof bookings.createBooking).toBe('function');
    expect(typeof bookings.cancelBooking).toBe('function');
    expect(typeof bookings.confirmBooking).toBe('function');
    expect(typeof bookings.declineBooking).toBe('function');
    expect(typeof bookings.rescheduleBooking).toBe('function');
  });

  it('devuelve el envelope V3 { booking } que espera createBookingElevated', async () => {
    const result = await bookings.createBooking({
      serviceId: 'svc-1',
      totalParticipants: 1,
    });

    expect(result.booking).toMatchObject({
      _id: 'mock-booking-id',
      revision: 1,
      status: 'PENDING',
    });
    expect(result.bookingId).toBeUndefined(); // shape legacy aplanada no debe usarse
  });

  it('cancelBooking conserva bookingId y revision (contrato de compensaciones)', async () => {
    const result = await bookings.cancelBooking({
      bookingId: 'bk-1',
      revision: 3,
      flowControlSettings: { ignoreCancellationPolicy: true },
    });

    expect(result.booking).toMatchObject({
      _id: 'bk-1',
      revision: 3,
      status: 'CANCELED',
    });
  });

  it('confirmBooking y declineBooking devuelven el estado correspondiente', async () => {
    const confirmed = await bookings.confirmBooking({ bookingId: 'bk-1', paymentStatus: 'PAID' });
    expect(confirmed.booking).toMatchObject({ _id: 'bk-1', status: 'CONFIRMED' });

    const declined = await bookings.declineBooking({ bookingId: 'bk-1', paymentStatus: 'DECLINED' });
    expect(declined.booking).toMatchObject({ _id: 'bk-1', status: 'DECLINED' });
  });

  it('rescheduleBooking incrementa la revision recibida', async () => {
    const result = await bookings.rescheduleBooking({ bookingId: 'bk-1', revision: 2 });

    expect(result.booking).toMatchObject({
      _id: 'bk-1',
      revision: 3,
      status: 'CONFIRMED',
    });
  });

  it('respeta la superficie de availabilityTimeSlots usada por reservas.web.js', async () => {
    expect((await availabilityTimeSlots.listAvailabilityTimeSlots({})).timeSlots).toEqual([]);
    expect((await availabilityTimeSlots.getAvailabilityTimeSlot('ts-1')).timeSlot).toBeNull();
  });

  it('expone getAvailability y el default export con los mismos objetos', async () => {
    expect((await getAvailability({})).slots).toEqual([]);
    expect(bookingsModule.bookings).toBe(bookings);
    expect(bookingsModule.availabilityTimeSlots).toBe(availabilityTimeSlots);
    expect(typeof createBooking).toBe('function');
    expect(typeof cancelBooking).toBe('function');
  });
});