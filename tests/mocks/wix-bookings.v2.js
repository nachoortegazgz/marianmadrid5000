// Mock de wix-bookings.v2 para testing
export const bookings = {
  getAvailability: async (options) => {
    return { slots: [] };
  },
  createBooking: async (bookingData) => {
    return { bookingId: 'mock-booking-id', status: 'PENDING' };
  }
};

export default bookings;
