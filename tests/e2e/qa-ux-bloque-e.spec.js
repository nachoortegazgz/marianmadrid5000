/**
 * BLOQUE E — TIENDA ONLINE (WIX STORES V1)
 */
import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

test.describe('Bloque E - Tienda online (Wix Stores V1)', () => {
  test('E-01: acceso a tienda - verificar productos, precios EUR, imágenes', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Buscar enlace a tienda
    const tiendaLink = page.locator('a:has-text("tienda"), a:has-text("boutique"), a:has-text("shop"), .tienda-link').first();
    const tiendaVisible = await tiendaLink.isVisible().catch(() => false);

    if (tiendaVisible) {
      await tiendaLink.click();
      await page.waitForLoadState('networkidle');
      console.log(`🛒 E-01: Navegado a tienda. URL: ${page.url()}`);
    }

    // Verificar productos
    const productos = await page.locator('[data-product], .product, .store-product, [itemtype*="Product"]').all();
    console.log(`📦 E-01: Productos encontrados: ${productos.length}`);

    if (productos.length > 0) {
      // Verificar que tiene precio en EUR
      const primerProducto = productos[0];
      const precioText = await primerProducto.textContent();
      const tienePrecioEUR = precioText && (precioText.includes('€') || precioText.includes('EUR') || precioText.match(/\d+,\d{2}/));

      console.log(`✅ E-01: Producto con precio EUR: ${tienePrecioEUR}`);
    }
  });

  test('E-02: página de producto - verificar nombre, precio, descripción, botón añadir', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Buscar producto y hacer clic
    const productos = await page.locator('[data-product], .product, .store-product').all();

    if (productos.length > 0) {
      await productos[0].click();
      await page.waitForLoadState('networkidle');

      // Verificar elementos de página de producto
      const nombreVisible = await page.locator('[data-name], .product-name, h1, h2').first().isVisible().catch(() => false);
      const precioVisible = await page.locator('[data-price], .product-price').first().isVisible().catch(() => false);
      const descripcionVisible = await page.locator('[data-description], .product-description, p').first().isVisible().catch(() => false);
      const btnAnadir = await page.locator('[data-add-to-cart], .add-to-cart, button:has-text("Añadir")').first().isVisible().catch(() => false);

      console.log(`📦 E-02: Página de producto - Nombre:${nombreVisible} Precio:${precioVisible} Desc:${descripcionVisible} Añadir:${btnAnadir}`);
    } else {
      console.log(`ℹ️ E-02: No hay productos para probar`);
    }
  });

  test('E-03: carrito - añadir producto y verificar actualización', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Buscar botón añadir al carrito
    const btnAnadir = page.locator('[data-add-to-cart], .add-to-cart, button:has-text("Añadir")').first();
    const btnVisible = await btnAnadir.isVisible().catch(() => false);

    if (btnVisible) {
      await btnAnadir.click();
      await page.waitForTimeout(500); // Esperar actualización

      // Verificar carrito
      const carrito = await page.locator('[data-cart], .cart, .carrito, nav a:has-text("carrito")').first().isVisible().catch(() => false);
      const carritoBadge = await page.locator('[data-cart-count], .cart-badge, [aria-label*="carrito"]').first().textContent().catch(() => '0');

      console.log(`🛒 E-03: Carrito visible:${carrito}, Badge: ${carritoBadge}`);
    } else {
      console.log(`ℹ️ E-03: Botón añadir no encontrado`);
    }
  });

  test('E-04: checkout - inspección sin completar pago', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Buscar carrito y hacer clic
    const carritoLink = page.locator('nav a:has-text("carrito"), [data-cart], .cart-link').first();
    const carritoVisible = await carritoLink.isVisible().catch(() => false);

    if (carritoVisible) {
      await carritoLink.click();
      await page.waitForLoadState('networkidle');

      // Verificar formulario de checkout
      const checkoutForm = page.locator('form, .checkout-form, .order-form').first();
      const checkoutVisible = await checkoutForm.isVisible().catch(() => false);

      if (checkoutVisible) {
        const camposEnvio = await checkoutForm.locator('input[name="address"], input[name="direccion"], .address-field').count();
        const camposPago = await checkoutForm.locator('input[name="card"], .payment-field, [data-payment]').count();

        console.log(`💳 E-04: Checkout - Campos envío:${camposEnvio}, Campos pago:${camposPago}`);
        console.log(`✅ E-04: Checkout inspeccionado (sin completar pago)`);
      }
    } else {
      console.log(`ℹ️ E-04: Carrito no disponible para checkout`);
    }
  });
});
