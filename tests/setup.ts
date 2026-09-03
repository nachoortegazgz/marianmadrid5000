import { wixData } from './mocks/wix-data-mock';
import { bookings, availabilityTimeSlots } from './mocks/wix-bookings-mock';
import { checkout, orders } from './mocks/wix-ecom-mock';

globalThis.wixData = wixData;
globalThis.bookings = bookings;
globalThis.availabilityTimeSlots = availabilityTimeSlots;
globalThis.checkout = checkout;
globalThis.orders = orders;