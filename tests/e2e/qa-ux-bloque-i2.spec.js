import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/site.js';

test.describe('Bloque I (parte 2) - Exposición de datos', () => {
  test('I-04: exposición de datos - revisar respuestas de red', async ({ page }) => {
    const secretosExpuestos = [];
    const piiExpuesta = [];

    page.on('response', async response => {
      try {
        const url = response.url();
        const contentType = response.headers().get('content-type') || '';

        if (contentType.includes('application/json')) {
          const body = await response.text();

          if (body.match(/api[_-]key|secret[_-]key|auth[_-]token|access[_-]token/i)) {
            secretosExpuestos.push({ url: url.substring(0, 80), snippet: body.substring(0, 80) });
          }

          if (body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
            piiExpuesta.push({ url: url.substring(0, 80) });
          }
        }
      } catch (e) {
        // Ignorar errores
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    console.log(`🔍 I-04: Secretos expuestos: ${secretosExpuestos.length}, PII detectada: ${piiExpuesta.length}`);

    if (secretosExpuestos.length > 0) {
      console.log(`❌ I-04: POSIBLE FALLO - Secretos en:`);
      for (const s of secretosExpuestos) {
        console.log(`  - ${s.url}`);
      }
    } else {
      console.log(`✅ I-04: No se detectaron secretos expuestos`);
    }

    if (piiExpuesta.length > 0) {
      console.log(`⚠️ I-04: PII en respuestas (revisar si son datos de prueba)`);
    }
  });
});
