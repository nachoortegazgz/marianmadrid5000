// Mock de wix-auth para testing
export const elevate = {
  elevate: async () => {
    return { token: 'mock-elevated-token' };
  }
};

export default elevate;
