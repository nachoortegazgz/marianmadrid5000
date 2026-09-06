// tests/mocks/wix-http-functions-mock.ts
// Mock de wix-http-functions para tests.
// Contrato: ok/ok/ok, badRequest, unauthorized, serverError, forbidden,
//           notFound, redirect -> { status, body, ...options }

export const ok = (options = {}) => ({ status: 200, ...options });
export const badRequest = (options = {}) => ({ status: 400, ...options });
export const unauthorized = (options = {}) => ({ status: 401, ...options });
export const forbidden = (options = {}) => ({ status: 403, ...options });
export const notFound = (options = {}) => ({ status: 404, ...options });
export const serverError = (options = {}) => ({ status: 500, ...options });
export const redirect = (to) => ({ status: 302, body: '', headers: { Location: to } });

export default { ok, badRequest, unauthorized, forbidden, notFound, serverError, redirect };