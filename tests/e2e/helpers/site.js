// Helpers compartidos para los tests E2E del sitio vivo.
// Todas las llamadas a endpoints publicos se hacen por fetch directo para
// validar contratos; la interaccion con la UI se hace via Playwright.

export const BASE_URL = process.env.E2E_BASE_URL || 'https://www.marianmadrid.es';
export const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'e2e+playwright@test.marianmadrid.es';
export const TEST_NAME = 'E2E Playwright';

// Prefijo que marca reservas de prueba para poder localizarlas y limpiarlas.
export const TEST_MARKER = '[E2E-TEST]';

export async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, json, text };
}

export async function getServices() {
  const { json, ok } = await fetchJson(`${BASE_URL}/_functions/get_services_list`);
  if (!ok) throw new Error('get_services_list fallo');
  // El envelope devuelve { services: [...] } o un array directo.
  const services = Array.isArray(json) ? json : (json.services || json.data || []);
  return services;
}

export async function getService(slugOrId) {
  const { json, ok } = await fetchJson(`${BASE_URL}/_functions/get_service?slug=${encodeURIComponent(slugOrId)}`);
  if (!ok) throw new Error(`get_service fallo para ${slugOrId}`);
  return json.service || json.data || json;
}
