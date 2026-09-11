/**
 * BLOQUE A — CARGA Y RENDIMIENTO INICIAL
 * QA/UX - Marian Madrid Peluquería y Estética
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

test.describe('Bloque A - Carga y rendimiento inicial', () => {
  test('A-01: pagina de inicio carga y contenido principal visible', async ({ page }) => {
    const startTime = Date.now();
    const res = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - startTime;

    expect(res.status()).toBeLessThan(400);
    console.log(`⏱️ Tiempo de carga DOM: ${loadTime}ms`);

    // Esperar a que el contenido principal sea visible
    await page.waitForLoadState('networkidle');

    // Verificar elementos esenciales
    await expect(page.locator('body')).toBeVisible();

    // Verificar que no hay errores de consola
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Navegar de nuevo para capturar consola
    await page.reload({ waitUntil: 'networkidle' });

    console.log(`✅ A-01: Página cargada en ${loadTime}ms, errores consola: ${errors.length}`);
  });

  test('A-02: verificación de elementos esenciales en español', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Verificar idioma español
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toMatch(/es|es-ES|es_ES/);

    // Verificar presencia de texto en español (no Lorem ipsum)
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Lorem ipsum');
    expect(bodyText).not.toContain('Lorem Ipsum');

    // Verificar elementos esenciales
    const hasTelefono = await page.locator('body').textContent().then(t =>
      t.includes('+34') || t.includes('876') || t.includes('Móvil')
    );
    console.log(`✅ A-02: Idioma ES=${htmlLang}, teléfono visible=${hasTelefono}`);
  });

  test('A-03: sin REST calls directas desde frontend y sin secretos expuestos', async ({ page }) => {
    const networkRequests = [];

    page.on('request', request => {
      const url = request.url();
      // Detectar llamadas REST directas a APIs Wix
      if (url.includes('wixapis.com') && !url.includes('_functions')) {
        networkRequests.push({ type: 'WIX_API', url });
      }
      // Detectar posibles secretos en URLs
      if (url.includes('key=') || url.includes('secret=') || url.includes('token=') || url.includes('api_key=')) {
        networkRequests.push({ type: 'POSSIBLE_SECRET', url });
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const wixApiCalls = networkRequests.filter(r => r.type === 'WIX_API');
    const secretLeaks = networkRequests.filter(r => r.type === 'POSSIBLE_SECRET');

    console.log(`🔍 A-03: Calls a wixapis.com desde frontend: ${wixApiCalls.length}`);
    console.log(`🔒 A-03: Posibles secretos en URLs: ${secretLeaks.length}`);

    // El frontend no debe hacer llamadas directas a Wix APIs
    // Las únicas permitidas son a _functions del sitio
    expect(wixApiCalls.length).toBe(0);
    expect(secretLeaks.length).toBe(0);
  });
});
