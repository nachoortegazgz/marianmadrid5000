// Mock de wix-ecom-backend para testing
export const checkout = {
  createCheckout: async (data) => {
    return { checkoutId: 'mock-checkout-id', url: 'https://mock.checkout.url' };
  }
};

export default checkout;
