import { wixData as wixDataMock } from './mocks/wix-data-mock';
import { bookings as bookingsMock, availabilityTimeSlots as availabilityTimeSlotsMock } from './mocks/wix-bookings-mock';
import { checkout as checkoutMock, orders as ordersMock } from './mocks/wix-ecom-mock';

declare global {
	var wixData: typeof wixDataMock;
	var bookings: typeof bookingsMock;
	var availabilityTimeSlots: typeof availabilityTimeSlotsMock;
	var checkout: typeof checkoutMock;
	var orders: typeof ordersMock;
}

globalThis.wixData = wixDataMock;
globalThis.bookings = bookingsMock;
globalThis.availabilityTimeSlots = availabilityTimeSlotsMock;
globalThis.checkout = checkoutMock;
globalThis.orders = ordersMock;