// tests/mocks/wix-ecom-mock.ts
// Mock de wix-ecom-backend para tests

export const checkout = {
  createCheckout: async (data: any) => {
    console.log('[MOCK Wix Ecom] createCheckout llamado', data);
    return {
      checkoutId: `mock-checkout-${Date.now()}`,
      redirectUrl: 'https://mock.wix.com/checkout'
    };
  },
  getCheckout: async (checkoutId: string) => {
    console.log(`[MOCK Wix Ecom] getCheckout: ${checkoutId}`);
    return {
      checkoutId,
      status: 'PENDING',
      totalAmount: 100
    };
  }
};

export default { checkout };
