/**
 * BLOQUE G — BLOG Y SEO
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

test.describe('Bloque G - Blog y SEO', () => {
  test('G-01: blog - verificar artículos publicados', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Navegar a blog
    const blogLink = page.locator('a:has-text("Blog"), .blog-link, nav a:has-text("blog")').first();
    const blogVisible = await blogLink.isVisible().catch(() => false);

    if (blogVisible) {
      await blogLink.click();
      await page.waitForLoadState('networkidle');

      // Verificar que hay artículos
      const articulos = await page.locator('[data-post], .post, .blog-post, article').all();
      console.log(`📝 G-01: Artículos en blog: ${articulos.length}`);

      if (articulos.length > 0) {
        const primerArticulo = articulos[0];
        const tieneTitulo = await primerArticulo.locator('h1, h2, h3, [data-title]').first().textContent().catch(() => '');
        const tieneFecha = await primerArticulo.textContent().then(t => t && t.match(/\d{1,2}\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december)\s*\d{4}/i));
        const tieneAutor = await primerArticulo.locator('.author, [data-author], .by, by:has-text("por")').count();

        console.log(`📝 G-01: Artículo - Título:${!!tieneTitulo} Fecha:${!!tieneFecha} Autor:${tieneAutor > 0}`);
      }
    } else {
      console.log(`ℹ️ G-01: Enlace a blog no encontrado`);
    }
  });

  test('G-02: metadatos SEO - title, meta description, Open Graph, canonical', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const title = await page.locator('title').textContent();
    const metaDesc = await page.locator('meta[name="description"]').getAttribute('content');
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    const ogDesc = await page.locator('meta[property="og:description"]').getAttribute('content');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');

    console.log(`🔍 G-02: SEO Metadatos:`);
    console.log(`  <title>: ${title?.substring(0, 80)}`);
    console.log(`  meta description: ${metaDesc?.substring(0, 80)}`);
    console.log(`  og:title: ${ogTitle}`);
    console.log(`  og:description: ${ogDesc?.substring(0, 60)}`);
    console.log(`  og:image: ${ogImage}`);
    console.log(`  canonical: ${canonical}`);

    expect(title).toBeTruthy();
    expect(metaDesc).toBeTruthy();
    expect(ogTitle).toBeTruthy();
  });

  test('G-03: datos estructurados - JSON-LD de negocio local', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Buscar scripts JSON-LD
    const jsonldScripts = await page.locator('script[type="application/ld+json"]').all();
    console.log(`📊 G-03: Scripts JSON-LD encontrados: ${jsonldScripts.length}`);

    for (let i = 0; i < jsonldScripts.length; i++) {
      const jsonld = await jsonldScripts[i].textContent();
      console.log(`  JSON-LD ${i + 1}: ${jsonld.substring(0, 150)}...`);

      // Verificar si es de tipo LocalBusiness o similar
      const esLocalBusiness = jsonld.includes('"LocalBusiness"') || jsonld.includes('"ProfessionalService"') || jsonld.includes('"Store"');
      if (esLocalBusiness) {
        console.log(`  ✅ Es tipo LocalBusiness/ProfessionalService`);
      }
    }
  });
});
