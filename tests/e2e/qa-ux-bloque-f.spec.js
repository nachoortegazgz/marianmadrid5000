/**
 * BLOQUE F — ÁREA DE MIEMBROS
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

test.describe('Bloque F - Área de miembros (solo inspección)', () => {
  test('F-01: acceso al área de miembros - login y campos', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Buscar botón de login/iniciar sesión
    const loginButton = page.locator('a:has-text("Iniciar sesión"), a:has-text("Mi cuenta"), a:has-text("Login"), .login-btn, [data-login]').first();
    const loginVisible = await loginButton.isVisible().catch(() => false);

    if (loginVisible) {
      await loginButton.click();
      await page.waitForLoadState('networkidle');

      // Verificar formulario de login
      const emailInput = page.locator('input[name="email"], input[type="email"], [data-email]').first();
      const passwordInput = page.locator('input[name="password"], input[type="password"], [data-password]').first();

      const emailVisible = await emailInput.isVisible().catch(() => false);
      const passwordVisible = await passwordInput.isVisible().catch(() => false);

      console.log(`🔐 F-01: Área de miembros - Email:${emailVisible} Contraseña:${passwordVisible}`);

      // Verificar opción recuperar contraseña
      const recoveryLink = await page.locator('a:has-text("recuperar"), a:has-text("password"), a:has-text(" contraseña")').count();
      console.log(`🔗 F-01: Enlace recuperar contraseña: ${recoveryLink > 0}`);
    } else {
      console.log(`ℹ️ F-01: Botón de login no encontrado en esta vista`);
    }
  });

  test('F-02: registro de miembro - verificar formulario (sin crear cuenta)', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Buscar formulario de registro
    const registerLink = page.locator('a:has-text("Registro"), a:has-text("Crear cuenta"), a:has-text("Sign up"), .register-link').first();
    const registerVisible = await registerLink.isVisible().catch(() => false);

    if (registerVisible) {
      await registerLink.click();
      await page.waitForLoadState('networkidle');

      // Verificar campos del formulario de registro
      const nombreInput = page.locator('input[name="name"], input[name="nombre"]').first();
      const emailInput = page.locator('input[name="email"], input[type="email"]').first();
      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      const rgpdCheckbox = page.locator('[data-rgpd], input[name="accept"]').first();

      const nombreVisible = await nombreInput.isVisible().catch(() => false);
      const emailVisible = await emailInput.isVisible().catch(() => false);
      const passwordVisible = await passwordInput.isVisible().catch(() => false);
      const rgpdVisible = await rgpdCheckbox.isVisible().catch(() => false);

      console.log(`📝 F-02: Registro - Nombre:${nombreVisible} Email:${emailVisible} Contraseña:${passwordVisible} RGPD:${rgpdVisible}`);

      // Verificar casilla de consentimiento
      if (rgpdVisible) {
        const isChecked = await rgpdCheckbox.isChecked().catch(() => false);
        console.log(`🔒 F-02: RGPD premarcado=${isChecked} (debe ser false)`);
        expect(isChecked).toBe(false);
      }

      console.log(`✅ F-02: Formulario de registro inspeccionado (no se creó cuenta)`);
    } else {
      console.log(`ℹ️ F-02: Formulario de registro no encontrado`);
    }
  });
});
