// tests/mocks/wix-auth-mock.ts
// Mock de wix-auth para tests
// Modela elevate real de Wix: devuelve una funcion elevada (wrapper) que
// propaga los argumentos a la funcion original.

export const elevate = (fn: Function) => async (...args: any[]) => fn(...args);

export const grant = async (permissions: string[]) => {
  console.log('[MOCK Wix Auth] grant llamado', permissions);
  return { granted: true };
};

export default { elevate, grant };
