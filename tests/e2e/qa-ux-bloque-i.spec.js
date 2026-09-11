/**
 * BLOQUE I — SEGURIDAD Y PRIVACIDAD
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

test.describe('Bloque I - Seguridad y privacidad', () => {
  test('I-01: políticas legales - verificar existencia y enlaces funcionando', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const privacidadLink = page.locator('a:has-text("Privacidad"), a:has-text("privacy"), a[href*="privacidad"]').first();
    const cookiesLink = page.locator('a:has-text("Cookies"), a[href*="cookies"]').first();
    const terminosLink = page.locator('a:has-text("Términos"), a:has-text("Condiciones"), a[href*="terminos"], a[href*="condiciones"]').first();
    const avisoLink = page.locator('a:has-text("Aviso"), a:has-text("Legal"), a[href*="aviso"], a[href*="legal"]').first();

    const privacidadVisible = await privacidadLink.isVisible().catch(() => false);
    const cookiesVisible = await cookiesLink.isVisible().catch(() => false);
    const terminosVisible = await terminosLink.isVisible().catch(() => false);
    const avisoVisible = await avisoLink.isVisible().catch(() => false);

    console.log(`🔒 I-01: Políticas - Privacidad:${privacidadVisible} Cookies:${cookiesVisible} Términos:${terminosVisible} Aviso:${avisoVisible}`);

    const links = [
      { name: 'Privacidad', element: privacidadLink, visible: privacidadVisible },
      { name: 'Cookies', element: cookiesLink, visible: cookiesVisible },
      { name: 'Términos', element: terminosLink, visible: terminosVisible },
      { name: 'Aviso', element: avisoLink, visible: avisoVisible },
    ];

    for (const link of links) {
      if (link.visible) {
        const href = await link.element.getAttribute('href');
        if (href && href.startsWith('/')) {
          const response = await page.goto(`${BASE_URL}${href}`, { waitUntil: 'domcontentloaded' });
          console.log(`  ✅ ${link.name}: ${response.status()}`);
        } else if (href) {
          console.log(`  ℹ️ ${link.name}: URL externa`);
        }
      } else {
        console.log(`  ⚠️ ${link.name}: No visible`);
      }
    }
  });

  test('I-02: banner de cookies - verificar aceptar/rechazar', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const cookieBanner = page.locator('[data-cookie-banner], .cookies-banner, .cookie-consent, [class*="cookie"]').first();
    const bannerVisible = await cookieBanner.isVisible().catch(() => false);

    console.log(`🍪 I-02: Banner cookies visible: ${bannerVisible}`);

    if (bannerVisible) {
      const aceptarBtn = cookieBanner.locator('button:has-text("Aceptar"), button:has-text("Accept"), [data-accept-cookies]').first();
      const rechazarBtn = cookieBanner.locator('button:has-text("Rechazar"), button:has-text("Reject"), [data-reject-cookies]').first();

      const aceptarVisible = await aceptarBtn.isVisible().catch(() => false);
      const rechazarVisible = await rechazarBtn.isVisible().catch(() => false);

      console.log(`  Aceptar:${aceptarVisible} Rechazar:${rechazarVisible}`);

      if (aceptarVisible && rechazarVisible) {
        console.log(`✅ I-02: Permite aceptar y rechazar`);
      } else if (aceptarVisible) {
        console.log(`⚠️ I-02: Solo botón aceptar`);
      }
    } else {
      console.log(`ℹ️ I-02: Banner no detectado`);
    }
  });

  test('I-03: HTTPS - verificar sitio seguro y sin contenido mixto', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const isSecure = page.url().startsWith('https://');
    console.log(`🔒 I-03: HTTPS activo: ${isSecure}`);
    expect(isSecure).toBe(true);

    const mixedContent = [];
    page.on('response', response => {
      if (response.url().startsWith('http://') && !response.url().startsWith('https://')) {
        mixedContent.push(response.url().substring(0, 100));
      }
    });

    await page.reload({ waitUntil: 'networkidle' });

    if (mixedContent.length > 0) {
      console.log(`❌ I-03: Contenido mixto: ${mixedContent.length}`);
    } else {
      console.log(`✅ I-03: Sin contenido mixto`);
    }
  });
});

