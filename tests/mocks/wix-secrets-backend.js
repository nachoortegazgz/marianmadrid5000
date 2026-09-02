// Mock de wix-secrets-backend para testing
export const getSecret = async (secretName) => {
  return { secret: 'mock-secret-value-' + secretName };
};

export default { getSecret };
