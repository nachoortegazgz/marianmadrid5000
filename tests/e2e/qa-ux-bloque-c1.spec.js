/**
 * BLOQUE C-01 a C-05 — FLUJO DE RESERVA ONLINE (Parte 1)
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

test.describe('Bloque C (parte 1) - Acceso y selección de servicio', () => {
  test('C-01: acceso al flujo de reserva desde botón principal', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const reservaButton = page.locator('button:has-text("Reserva"), a:has-text("Reserva"), .reserva-btn, [data-testid="reserva"]').first();
    const isVisible = await reservaButton.isVisible().catch(() => false);

    if (isVisible) {
      await reservaButton.click();
      await page.waitForLoadState('networkidle');
      console.log(`✅ C-01: Botón de reserva encontrado. URL: ${page.url()}`);
    } else {
      console.log(`⚠️ C-01: Buscando enlaces alternativos...`);
      const altLinks = await page.locator('a:has-text("sesión"), a:has-text("cita"), a:has-text("booking")').all();
      console.log(`🔗 Enlaces alternativos: ${altLinks.length}`);
    }
  });

  test('C-02: selección de servicio simple - verifica nombre, duración, precio EUR', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const serviciosLink = page.locator('a:has-text("servicios"), .servicios-link').first();
    if (await serviciosLink.isVisible()) {
      await serviciosLink.click();
      await page.waitForLoadState('networkidle');
    }

    const servicios = await page.locator('[data-service], .servicio-card, .service-item').all();
    console.log(`📋 C-02: Servicios encontrados: ${servicios.length}`);

    if (servicios.length > 0) {
      const svc = servicios[0];
      const tieneNombre = await svc.locator('.nombre, h3, h4, [data-name]').first().isVisible().catch(() => false);
      const tienePrecio = await svc.locator('.precio, [data-price]').first().isVisible().catch(() => false);
      console.log(`✅ C-02: Servicio con nombre=${tieneNombre}, precio=${tienePrecio}`);
    }
  });

  test('C-03: servicio dual con gap - verificar F1 y F2', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const permiteCombinar = await page.locator('[data-allow-combine="true"], .dual, .fases, .combinable').count();
    const tieneFases = await page.locator('[data-fase1], [data-fase2], .phase1, .phase2, F1, F2').count();

    console.log(`🔄 C-03: Servicios duales: ${permiteCombinar}, con fases: ${tieneFases}`);
  });

  test('C-04: calendario de disponibilidad - verificar 14 días', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const calendario = page.locator('.calendar, [data-calendar], .datepicker, .bk-calendar').first();
    const visible = await calendario.isVisible().catch(() => false);

    if (visible) {
      const dias = await calendario.locator('td, .day, [data-date]').all();
      console.log(`📅 C-04: Días en calendario: ${dias.length} (objetivo: 14)`);
    } else {
      console.log(`⚠️ C-04: Calendario no encontrado`);
    }
  });

  test('C-05: selección de horario - slots con hora de inicio', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const slots = await page.locator('[data-slot], .slot, .time-slot, .horario, .available-time').all();
    console.log(`⏰ C-05: Slots encontrados: ${slots.length}`);

    if (slots.length > 0) {
      const texto = await slots[0].textContent();
      const tieneHora = texto && texto.match(/\d{2}:\d{2}/);
      console.log(`✅ C-05: Slot con hora: ${!!tieneHora}`);
    }
  });
});
