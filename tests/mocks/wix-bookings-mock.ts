// tests/mocks/wix-bookings-mock.ts
// Mock de wix-bookings.v2 para tests unitarios

export interface Slot {
  primaryServiceGuid: string;
  scheduleId: string;
  resourceId?: string;
  localStartDate?: string;
  localEndDate?: string;
  availableSpots?: number;
  bookedSpots?: number;
  resourceName?: string;
  resources?: Array<{ id: string; name?: string }>;
  staffMemberId?: string;
}

export interface Booking {
  _id: string;
  revision?: number;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELED';
  paymentStatus: 'UNPAID' | 'PENDING_PAYMENT' | 'PAID';
}

export interface ContactDetails {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

// Funciones mockeadas
export const getAvailability = async (params: any) => {
  console.log('[MOCK Wix Bookings] getAvailability llamado', params);
  return { slots: [] };
};

export const bookings = {
  createBooking: async () => ({ _id: 'mock-booking-id', revision: 1 }),
  cancelBooking: async () => ({ success: true }),
  confirmOrDeclineBooking: async () => ({ success: true }),
  rescheduleBooking: async () => ({ _id: 'mock-booking-id', revision: 2 }),
};

export const availabilityTimeSlots = {
  listAvailabilityTimeSlots: async () => ({ timeSlots: [] }),
  getAvailabilityTimeSlot: async () => ({ timeSlot: null }),
};

export const createBooking = async (bookingData: any) => {
  console.log('[MOCK Wix Bookings] createBooking llamado', bookingData);
  return { booking: { _id: 'mock-booking-id', status: 'CONFIRMED' } };
};

export const cancelBooking = async (bookingId: string, revision: number) => {
  console.log(`[MOCK Wix Bookings] cancelBooking: ${bookingId}`);
  return { booking: { _id: bookingId, status: 'CANCELED' } };
};

export default {
  getAvailability,
  createBooking,
  cancelBooking,
  bookings,
  availabilityTimeSlots,
};
