/**
 * BLOQUE J — RESPONSIVE Y COMPATIBILIDAD
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

const VIEWPORTS = [
  { name: 'Desktop grande', width: 1920, height: 1080 },
  { name: 'Desktop', width: 1366, height: 768 },
  { name: 'Tablet horizontal', width: 1024, height: 768 },
  { name: 'Tablet vertical', width: 768, height: 1024 },
  { name: 'Móvil grande', width: 428, height: 926 },
  { name: 'Móvil estándar', width: 375, height: 812 },
  { name: 'Móvil pequeño', width: 320, height: 568 },
];

test.describe('Bloque J - Responsive y compatibilidad', () => {
  for (const vp of VIEWPORTS) {
    test(`J-01/${vp.name} - viewport ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });

      // Verificar sin desplazamiento horizontal
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      const hasHorizontalScroll = scrollWidth > clientWidth;

      console.log(`📱 J-01/${vp.name}: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}, horizontalScroll=${hasHorizontalScroll}`);

      // Verificar elementos principales visibles
      const hasLogo = await page.locator('logo, img[alt*="logo"], [class*="logo"]').first().isVisible().catch(() => false);
      const hasMenu = await page.locator('nav, .menu, header nav').first().isVisible().catch(() => false);
      const hasContent = await page.locator('main, .content, .main-content').first().isVisible().catch(() => false);

      console.log(`  Elementos: Logo=${hasLogo} Menu=${hasMenu} Content=${hasContent}`);

      if (hasHorizontalScroll) {
        console.log(`⚠️ J-01/${vp.name}: Hay desplazamiento horizontal`);
      } else {
        console.log(`✅ J-01/${vp.name}: Sin desplazamiento horizontal`);
      }

      expect(hasHorizontalScroll).toBe(false);
    });
  }

  test('J-02: verificación tactile - botones mínimo 44x44px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // Móvil

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const buttons = await page.locator('button, a.btn, input[type="submit"], [role="button"]').all();
    let touchableCount = 0;

    for (let i = 0; i < Math.min(buttons.length, 10); i++) {
      const box = await buttons[i].boundingBox();
      if (box && box.width >= 44 && box.height >= 44) {
        touchableCount++;
      }
    }

    console.log(`👆 J-02: Botones táctiles (≥44px) en móvil: ${touchableCount}/${Math.min(buttons.length, 10)}`);
  });

  test('J-03: capturas - homepage en diferentes viewports', async ({ page }) => {
    // Desktop
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `/tmp/qa-ux-j03-desktop.png`, fullPage: false });
    console.log(`📸 J-03: Captura desktop 1366x768 → /tmp/qa-ux-j03-desktop.png`);

    // Móvil
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.screenshot({ path: '/tmp/qa-ux-j03-mobile.png', fullPage: false });
    console.log(`📸 J-03: Captura móvil 375x812 → /tmp/qa-ux-j03-mobile.png`);
  });
});
