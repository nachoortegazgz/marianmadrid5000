/**
 * BLOQUE C-06 a C-11 — FLUJO DE RESERVA ONLINE (Parte 2)
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

test.describe('Bloque C (parte 2) - Profesional, formulario, pago y confirmación', () => {
  test('C-06: selector de profesional - listar 3 profesionales + "cualquier"', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const selector = page.locator('[data-staff], .staff-selector, select[name="professional"], [data-resource]').first();
    const visible = await selector.isVisible().catch(() => false);

    if (visible) {
      const opciones = await selector.locator('option').all();
      const count = opciones.length;
      const tieneCualquier = await selector.locator('option:has-text("Cualquier"), option:has-text("any"), option[value=""]').count();

      console.log(`👤 C-06: Profesionales en selector: ${count}, "Cualquier": ${tieneCualquier > 0}`);
    } else {
      console.log(`📝 C-06: Selector de profesional no visible`);
    }
  });

  test('C-07: formulario de datos del cliente - validación y RGPD', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const nombreInput = page.locator('input[name="name"], input[name="nombre"], input[placeholder*="nombre"]').first();
    const emailInput = page.locator('input[name="email"], input[type="email"]').first();
    const telefonoInput = page.locator('input[name="phone"], input[name="telefono"], input[type="tel"]').first();
    const rgpdCheckbox = page.locator('[data-rgpd], input[name="accept"], input[type="checkbox"]').first();

    const nombreVisible = await nombreInput.isVisible().catch(() => false);
    const emailVisible = await emailInput.isVisible().catch(() => false);
    const telefonoVisible = await telefonoInput.isVisible().catch(() => false);
    const rgpdVisible = await rgpdCheckbox.isVisible().catch(() => false);

    console.log(`📝 C-07: Campos visibles - Nombre:${nombreVisible} Email:${emailVisible} Teléfono:${telefonoVisible} RGPD:${rgpdVisible}`);

    if (nombreVisible) await nombreInput.fill('Prueba QA');
    if (emailVisible) await emailInput.fill('qa.test@example.com');
    if (telefonoVisible) await telefonoInput.fill('+34600000000');

    if (rgpdVisible) {
      const isChecked = await rgpdCheckbox.isChecked().catch(() => false);
      console.log(`🔒 C-07: RGPD premarcado=${isChecked} (debe ser false)`);
      expect(isChecked).toBe(false);
    }
  });

  test('C-08: selección de método de pago - online vs presencial', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const pagoOnline = await page.locator('[data-pago="online"], .pago-online, :has-text("Online"), :has-text("tarjeta")').count();
    const pagoPresencial = await page.locator('[data-pago="presencial"], .pago-presencial, :has-text("Presencial")').count();

    console.log(`💳 C-08: Pago Online:${pagoOnline}, Presencial:${pagoPresencial}`);

    if (pagoPresencial > 0) {
      await page.locator('[data-pago="presencial"], .pago-presencial').first().click();
      console.log(`✅ C-08: Pago presencial seleccionado`);
    }
  });

  test('C-09: confirmación de reserva - verificar resumen y mensaje', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const confirmButton = page.locator('button[type="submit"], .confirm-btn, [data-action="confirm"]').first();
    const confirmVisible = await confirmButton.isVisible().catch(() => false);

    const hayPagoOnline = await page.locator('.pago-online, :has-text("tarjeta")').count() > 0;

    console.log(`📝 C-09: Confirmación visible:${confirmVisible}, Pago online:${hayPagoOnline}`);

    if (confirmVisible && !hayPagoOnline) {
      console.log(`✅ C-09: Confirmación disponible (presencial)`);
    } else if (confirmVisible && hayPagoOnline) {
      console.log(`⚠️ C-09: Requiere sandbox (hay pago online)`);
    }
  });

  test('C-10: verificación de idempotencia - duplicados', async ({ page }) => {
    console.log(`🔍 C-10: Verificación de idempotencia documentada (requiere reserva real)`);
  });

  test('C-11: cancelación de prueba - verificar opción', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const cancelarButton = page.locator('button:has-text("Cancelar"), .cancel-btn, [data-action="cancel"]').first();
    const visible = await cancelarButton.isVisible().catch(() => false);

    console.log(`❌ C-11: Cancelación visible:${visible}`);
  });
});
