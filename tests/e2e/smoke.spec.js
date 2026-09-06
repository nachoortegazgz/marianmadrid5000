// Smoke tests de solo lectura contra el sitio vivo.
// No crean reservas; validan que los endpoints publicos y la UI responden.
import { test, expect } from '@playwright/test';
import { BASE_URL, fetchJson, getServices, getService } from './helpers/site.js';

test.describe('Smoke - endpoints publicos', () => {
  test('get_health responde 200 y version', async () => {
    const { status, json } = await fetchJson(`${BASE_URL}/_functions/health`);
    expect(status).toBe(200);
    expect(json.status).toBe('OK');
    expect(json.version).toBeTruthy();
  });

  test('get_services_list devuelve lista no vacia con contratos validos', async () => {
    const services = await getServices();
    expect(Array.isArray(services)).toBe(true);
    expect(services.length).toBeGreaterThan(0);
    const s = services[0];
    expect(s).toHaveProperty('serviceId');
    expect(s).toHaveProperty('title');
    expect(s).toHaveProperty('slugUrl');
    expect(typeof s.price).toBe('number');
  });

  test('get_service devuelve detalle por slugUrl', async () => {
    const services = await getServices();
    const target = services.find((s) => s.slugUrl) || services[0];
    const detail = await getService(target.slugUrl || target.serviceId);
    expect(detail).toBeTruthy();
  });
});

test.describe('Smoke - UI publica', () => {
  test('la pagina de inicio carga', async ({ page }) => {
    const res = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    expect(res.status()).toBeLessThan(400);
  });

  test('pagina de servicio redirige al calendario con query', async ({ page }) => {
    const services = await getServices();
    const target = services.find((s) => s.slugUrl) || services[0];
    const slug = target.slugUrl || target.serviceId;
    await page.goto(`${BASE_URL}/${slug}`, { waitUntil: 'networkidle' });
    const url = page.url();
    // Espera redireccion al calendario o se queda en pagina de servicio valida
    expect(url).toMatch(/calendario|reserva|booking/i);
  });
});
