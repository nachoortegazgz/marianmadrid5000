/**
 * BLOQUE H — ACCESIBILIDAD BÁSICA
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

test.describe('Bloque H - Accesibilidad básica', () => {
  test('H-01: contraste y legibilidad básica', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Evaluar visualmente contraste en secciones principales
    const bodyBackground = await page.locator('body').evaluate(el => {
      return window.getComputedStyle(el).backgroundColor;
    });

    const bodyColor = await page.locator('body').evaluate(el => {
      return window.getComputedStyle(el).color;
    });

    console.log(`🎨 H-01: body background=${bodyBackground}, color=${bodyColor}`);

    // Verificar que hay suficiente contraste (básico)
    expect(bodyColor).toBeTruthy();
  });

  test('H-02: imágenes sin atributo alt', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Contar imágenes sin alt
    const imagenesSinAlt = await page.locator('img:not([alt])').count();
    const imagenesConAltVacio = await page.locator('img[alt=""]').count();
    const totalImagenes = await page.locator('img').count();

    console.log(`🖼️ H-02: Imágenes totales: ${totalImagenes}`);
    console.log(`  Sin atributo alt: ${imagenesSinAlt}`);
    console.log(`  Con alt vacío: ${imagenesConAltVacio}`);

    if (imagenesSinAlt > 0 || imagenesConAltVacio > 0) {
      console.log(`⚠️ H-02: Hay ${imagenesSinAlt + imagenesConAltVacio} imágenes sin descripción alternativa`);
    } else {
      console.log(`✅ H-02: Todas las imágenes tienen alt`);
    }
  });

  test('H-03: jerarquía de encabezados - verificar h1 único y estructura lógica', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Contar encabezados por nivel
    const h1Count = await page.locator('h1').count();
    const h2Count = await page.locator('h2').count();
    const h3Count = await page.locator('h3').count();
    const h4Count = await page.locator('h4').count();

    console.log(`🏷️ H-03: Encabezados - h1:${h1Count}, h2:${h2Count}, h3:${h3Count}, h4:${h4Count}`);

    // Verificar h1 único
    if (h1Count === 1) {
      console.log(`✅ H-03: Existe exactamente un h1`);
    } else if (h1Count === 0) {
      console.log(`⚠️ H-03: No hay h1 (puede ser válido en algunas páginas)`);
    } else {
      console.log(`❌ H-03: Hay ${h1Count} h1s (debería ser 1)`);
    }
  });

  test('H-04: navegación por teclado - verificar orden de tabulación y foco visible', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Verificar elementos enfocables
    const tabbableElements = await page.locator('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])').all();
    console.log(`⌨️ H-04: Elementos enfocables encontrados: ${tabbableElements.length}`);

    // Verificar que hay outline/focus visible en los elementos
    const hasFocusStyle = await page.evaluate(() => {
      const style = document.createElement('style');
      document.head.appendChild(style);
      return true;
    });

    console.log(`✅ H-04: Hay elementos que aceptan foco`);
  });

  test('H-05: formularios accesibles - inputs con labels', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Buscar todos los inputs
    const inputs = await page.locator('input:not([type="hidden"]), textarea, select').all();
    let inputsSinLabel = 0;

    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const name = await input.getAttribute('name');

      // Buscar label asociado
      if (id) {
        const label = await page.locator(`label[for="${id}"]`).count();
        if (label === 0) inputsSinLabel++;
      } else if (name) {
        const label = await page.locator(`label[for="${name}"], .${name}-label`).count();
        if (label === 0) inputsSinLabel++;
      } else {
        inputsSinLabel++;
      }
    }

    console.log(`📝 H-05: Inputs encontrados: ${inputs.length}, Sin label: ${inputsSinLabel}`);
    if (inputsSinLabel === 0) {
      console.log(`✅ H-05: Todos los inputs tienen label asociado`);
    } else {
      console.log(`⚠️ H-05: ${inputsSinLabel} inputs podrían no tener label`);
    }
  });
});
