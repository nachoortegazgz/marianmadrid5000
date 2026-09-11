// Mock de wix-bookings.v2 para testing.
// NOTA: el alias de vitest (vitest.config.mjs) resuelve "wix-bookings.v2" a
// tests/mocks/wix-bookings-mock.ts; este archivo es la version JS standalone
// con el MISMO contrato (exports: bookings, availabilityTimeSlots, ...) y
// envelopes de respuesta fieles a la API V3 de Wix.
// Consumido por src/backend/booking/bookingCore.js y src/backend/reservas.web.js.
//
// No se usa Object.freeze a proposito: los tests reasignan metodos
// (p.ej. bookings.createBooking = vi.fn()).

const DEFAULT_BOOKING_ID = "mock-booking-id";

// Envelope V3 de Wix: { booking: { _id, revision, status, paymentStatus } }.
// Se omiten los overrides con valor undefined para no pisar los defaults.
function bookingEnvelope(overrides = {}) {
  const clean = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined)
  );
  return {
    booking: {
      _id: DEFAULT_BOOKING_ID,
      revision: 1,
      status: "PENDING",
      paymentStatus: "UNPAID",
      ...clean,
    },
  };
}

export const bookings = {
  // getAvailability(options) -> { slots: Slot[] }
  getAvailability: async (options) => {
    return { slots: [] };
  },

  // createBooking(bookingData) -> { booking: { _id, revision, status, ... } }
  createBooking: async (bookingData) => {
    return bookingEnvelope();
  },

  // cancelBooking({ bookingId, revision, flowControlSettings }) -> { booking }
  cancelBooking: async ({ bookingId, revision } = {}) => {
    return bookingEnvelope({ _id: bookingId, revision, status: "CANCELED" });
  },

  // confirmBooking({ bookingId, paymentStatus, revision }) -> { booking }
  confirmBooking: async ({ bookingId, revision } = {}) => {
    return bookingEnvelope({ _id: bookingId, revision, status: "CONFIRMED" });
  },

  // declineBooking({ bookingId, paymentStatus, revision }) -> { booking }
  declineBooking: async ({ bookingId, revision } = {}) => {
    return bookingEnvelope({ _id: bookingId, revision, status: "DECLINED" });
  },

  // confirmOrDeclineBooking({ bookingId, action }) -> { booking }
  confirmOrDeclineBooking: async ({ bookingId, revision } = {}) => {
    return bookingEnvelope({ _id: bookingId, revision, status: "CONFIRMED" });
  },

  // rescheduleBooking({ bookingId, schedule, revision }) -> { booking }
  // La revision se incrementa, igual que en la API real.
  rescheduleBooking: async ({ bookingId, revision } = {}) => {
    return bookingEnvelope({
      _id: bookingId,
      revision: (Number(revision) || 1) + 1,
      status: "CONFIRMED",
    });
  },
};

export const availabilityTimeSlots = {
  // listAvailabilityTimeSlots(query) -> { timeSlots: TimeSlot[] }
  listAvailabilityTimeSlots: async (query) => {
    return { timeSlots: [] };
  },

  // getAvailabilityTimeSlot(timeSlotId) -> { timeSlot: TimeSlot | null }
  getAvailabilityTimeSlot: async (timeSlotId) => {
    return { timeSlot: null };
  },
};

// Helpers como exports top-level (paridad con wix-bookings-mock.ts)
export const getAvailability = bookings.getAvailability;
export const createBooking = bookings.createBooking;
export const cancelBooking = bookings.cancelBooking;

export default {
  bookings,
  availabilityTimeSlots,
  getAvailability,
  createBooking,
  cancelBooking,
};
