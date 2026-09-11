/**
 * BLOQUE B — NAVEGACIÓN Y ARQUITECTURA DE INFORMACIÓN
 * QA/UX - Marian Madrid Peluquería y Estética
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

const MENU_ITEMS = [
  { name: 'Inicio', pattern: /inicio|home/i },
  { name: 'Servicios', pattern: /servicios|servicios-y-planes/i },
  { name: 'Boutique', pattern: /boutique|tienda|shop/i },
  { name: 'Blog', pattern: /blog/i },
];

test.describe('Bloque B - Navegación y arquitectura de información', () => {
  test('B-01: mapa de navegación - recorrer menú principal', async ({ page }) => {
    const visited = [];
    const errors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Extraer-links del menú de navegación
    const menuLinks = await page.locator('nav a, header a, .menu a').all();
    const navUrls = [];

    for (const link of menuLinks) {
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      if (href && href.startsWith('http')) {
        navUrls.push({ text: text?.trim(), href });
      }
    }

    console.log(`📍 URLs encontradas en menú: ${navUrls.length}`);

    // Verificar footer
    const footerLinks = await page.locator('footer a').all();
    const footerUrls = [];

    for (const link of footerLinks) {
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      if (href) {
        footerUrls.push({ text: text?.trim(), href });
      }
    }

    // Verificar presencia de políticas legales en footer
    const footerText = await page.locator('footer').textContent();
    const hasPrivacidad = footerText?.match(/privacidad|privacy/i);
    const hasCookies = footerText?.match(/cookies/i);
    const hasTerminos = footerText?.match(/terminos|terms|condiciones/i);
    const hasAviso = footerText?.match(/aviso|legal/i);

    console.log(`🔒 Footer: Privacidad=${!!hasPrivacidad}, Cookies=${!!hasCookies}, Términos=${!!hasTerminos}, Aviso=${!!hasAviso}`);

    expect(navUrls.length).toBeGreaterThan(0);
    expect(errors.length).toBe(0);
  });

  test('B-02: navegación móvil - viewport iPhone SE 375x812', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Verificar que no hay desplazamiento horizontal
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const hasHorizontalScroll = scrollWidth > clientWidth;

    console.log(`📱 B-02 Móvil: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}, horizontalScroll=${hasHorizontalScroll}`);

    // Verificar botones con tamaño táctil mínimo 44x44px (muestra algunos)
    const buttons = await page.locator('button, a.btn, input[type="submit"]').all();
    let touchableButtons = 0;

    for (const btn of buttons.slice(0, 5)) {
      const box = await btn.boundingBox();
      if (box && box.width >= 44 && box.height >= 44) {
        touchableButtons++;
      }
    }

    console.log(`✅ B-02 Móvil: Botones táctiles encontrados (≥44px): ${touchableButtons}/${buttons.length}`);
    expect(hasHorizontalScroll).toBe(false);
  });

  test('B-03: navegación tablet - viewport iPad 768x1024', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Verificar layout básico
    const bodyVisible = await page.locator('body').isVisible();
    const mainContent = await page.locator('main, .main-content, .content').first().isVisible().catch(() => false);

    console.log(`📟 B-03 Tablet iPad: bodyVisible=${bodyVisible}, mainContent=${mainContent}`);
    expect(bodyVisible).toBe(true);
  });
});
