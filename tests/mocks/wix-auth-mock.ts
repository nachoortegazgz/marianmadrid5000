// tests/mocks/wix-auth-mock.ts
// Mock de wix-auth para tests

export const elevate = (fn: Function) => fn();

export const grant = async (permissions: string[]) => {
  console.log('[MOCK Wix Auth] grant llamado', permissions);
  return { granted: true };
};

export default { elevate, grant };
