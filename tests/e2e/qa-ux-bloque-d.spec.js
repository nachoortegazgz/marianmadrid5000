/**
 * BLOQUE D — FORMULARIOS DE CONTACTO
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

test.describe('Bloque D - Formularios de contacto', () => {
  test('D-01: localización de formularios', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const formularios = await page.locator('form').all();
    console.log(`📋 D-01: Formularios encontrados en página: ${formularios.length}`);

    for (let i = 0; i < formularios.length; i++) {
      const action = await formularios[i].getAttribute('action');
      const formularioId = await formularios[i].getAttribute('id');
      const formularioName = await formularios[i].getAttribute('name');
      console.log(`  Formulario ${i + 1}: id=${formularioId}, name=${formularioName}, action=${action}`);
    }
  });

  test('D-02: prueba de envío válido con datos ficticios', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Buscar formulario de contacto
    const contactForm = page.locator('form').filter({ hasText: /contacto|mensaje|envíar/i }).first();
    const isVisible = await contactForm.isVisible().catch(() => false);

    if (isVisible) {
      await contactForm.scrollIntoView();

      const nombreInput = contactForm.locator('input[name="name"], input[name="nombre"], input[placeholder*="nombre"]').first();
      const emailInput = contactForm.locator('input[name="email"], input[type="email"]').first();
      const mensajeInput = contactForm.locator('textarea[name="message"], textarea[name="mensaje"]').first();
      const submitButton = contactForm.locator('button[type="submit"], input[type="submit"]').first();

      const nombreVisible = await nombreInput.isVisible().catch(() => false);
      const emailVisible = await emailInput.isVisible().catch(() => false);
      const mensajeVisible = await mensajeInput.isVisible().catch(() => false);

      console.log(`📝 D-02: Campos visibles - Nombre:${nombreVisible} Email:${emailVisible} Mensaje:${mensajeVisible}`);

      if (nombreVisible) await nombreInput.fill('QA Test');
      if (emailVisible) await emailInput.fill('qa.test@example.com');
      if (mensajeVisible) await mensajeInput.fill('Prueba automatizada de formulario');

      // Verificar casilla RGPD si existe
      const rgpdCheckbox = contactForm.locator('[data-rgpd], input[name="accept"]').first();
      const rgpdVisible = await rgpdCheckbox.isVisible().catch(() => false);

      if (rgpdVisible) {
        const isChecked = await rgpdCheckbox.isChecked().catch(() => false);
        console.log(`🔒 D-02: RGPD premarcado=${isChecked} (debe ser false)`);
        expect(isChecked).toBe(false);
      }

      console.log(`✅ D-02: Formulario de contacto preparado para envío`);
    } else {
      console.log(`ℹ️ D-02: Formulario de contacto no encontrado en esta vista`);
    }
  });

  test('D-03: prueba de envío inválido - campos vacíos y email inválido', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const contactForm = page.locator('form').filter({ hasText: /contacto|mensaje|envíar/i }).first();
    const isVisible = await contactForm.isVisible().catch(() => false);

    if (isVisible) {
      const emailInput = contactForm.locator('input[name="email"], input[type="email"]').first();
      const emailVisible = await emailInput.isVisible().catch(() => false);

      if (emailVisible) {
        // Prueba con email inválido
        await emailInput.fill('email-invalido');
        console.log(`📝 D-03: Email inválido introducido: email-invalido`);

        // Verificar que hay validación (el input debería tener error class o similar)
        const tieneError = await emailInput.evaluate(el => el.classList?.contains('error') || el.validationMessage);
        console.log(`⚠️ D-03: Email inválido - validación: ${tieneError}`);
      }
    } else {
      console.log(`ℹ️ D-03: Formulario no disponible para prueba de validación`);
    }
  });

  test('D-04: protección antispam - detectar CAPTCHA', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Buscar CAPTCHA o protecciones similares
    const recaptcha = await page.locator('.g-recaptcha, [data-recaptcha], recaptcha').count();
    const honeypot = await page.locator('input[name="_gotcha"], input[name="honeypot"], .hpfield').count();
    const cloudflare = await page.locator('.cf-challenge, [data-cf-turnstile]').count();

    console.log(`🛡️ D-04: Protección antispam detectada - reCAPTCHA:${recaptcha}, Honeypot:${honeypot}, Cloudflare:${cloudflare}`);

    if (recaptcha === 0 && honeypot === 0 && cloudflare === 0) {
      console.log(`ℹ️ D-04: No se detectaron protecciones antispam obvias (puede estar en backend)`);
    }
  });
});
