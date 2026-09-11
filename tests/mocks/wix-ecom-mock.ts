// tests/mocks/wix-ecom-mock.ts
// Mock de wix-ecom-backend para tests

export const checkout = {
  createCheckout: async (data: any) => {
    console.log('[MOCK Wix Ecom] createCheckout llamado', data);
    return {
      checkout: { _id: `mock-checkout-${Date.now()}`, checkoutUrl: 'https://mock.url' }
    };
  },
  getCheckoutUrl: async () => ({ checkoutUrl: 'https://mock.url' }),
};

export const orders = {
  getOrder: async () => ({ _id: 'mock-order-id', paymentStatus: 'PAID' }),
};

export default { checkout, orders };
