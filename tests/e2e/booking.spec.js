// Flujo completo de reserva REAL como cliente:
//   1. lista servicios publicos
//   2. resuelve un slot disponible (fecha + recurso) para un servicio
//   3. envia un booking con datos de prueba identificables (E2E-TEST)
//   4. verifica confirmacion y bookingId
//   5. cancela la reserva de prueba (limpieza)
//   6. verifica cancelacion
//
// NOTA: crea una reserva real en Wix. Se marca con TEST_MARKER en los datos
// del cliente para poder identificarla. Requiere E2E_HMAC_SECRET (mismo secreto
// que POWER_AUTOMATE) y que el sitio este publicado.
import { test, expect } from '@playwright/test';
import { TEST_EMAIL, TEST_NAME, TEST_MARKER } from './helpers/site.js';
import { signedHeaders } from './helpers/hmac.js';

const BASE = process.env.E2E_BASE_URL || 'https://www.marianmadrid.es';

async function postJson(path, body) {
  const bodyString = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: signedHeaders(bodyString),
    body: bodyString,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}

// Encuentra un servicio simple (no combinado) que este disponible.
async function findAvailableService() {
  const res = await fetch(`${BASE}/_functions/get_services_list`);
  const list = await res.json();
  const services = Array.isArray(list) ? list : (list.services || list.data || []);
  return services.find((s) => !s.allowCombine && s.slugUrl) || services[0];
}

// Calcula una fecha objetivo ~5 dias en el futuro en zona Madrid.
function futureDate(daysAhead = 5) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

test.describe('Flujo de reserva real como cliente', () => {
  test.skip(!process.env.E2E_HMAC_SECRET, 'E2E_HMAC_SECRET no configurado: omitido');

  test('reserva + cancela un servicio simple', async () => {
    const service = await findAvailableService();
    expect(service, 'debe haber al menos un servicio publico').toBeTruthy();
    const serviceId = service.serviceId;
    const dateYmd = futureDate(5);

    // Slot simple de 10:00 a 10:30 (30 min) — el resolver real validara disponibilidad.
    const localStartDate = `${dateYmd}T10:00:00`;

    const bookingPayload = {
      cliente: {
        email: TEST_EMAIL,
        firstName: TEST_NAME,
        lastName: 'TEST',
        phone: '+34600000000',
        notes: `${TEST_MARKER} reserva Playwright ${Date.now()}`,
      },
      metaCita: {
        serviceId,
        paymentStatus: 'UNPAID',
        paymentMethod: 'ONLINE',
      },
      slotF1: {
        serviceId,
        localStartDate,
        resourceFilterId: 'any',
      },
      slotF2: null,
    };

    // 1) Crear reserva.
    const created = await postJson('/_functions/booking', bookingPayload);
    console.log('[E2E] booking response:', JSON.stringify(created.json));
    expect(created.ok, `booking debia responder 200: ${JSON.stringify(created.json)}`).toBe(true);
    expect(created.json.status).toBe('SUCCESS');

    const data = created.json.data || {};
    const bookingId = data.bookingId || data._id;
    expect(bookingId, 'la reserva debe devolver un bookingId').toBeTruthy();

    // 2) Limpieza: cancelar la reserva de prueba.
    const cancelled = await postJson('/_functions/e2e-cancel', {
      bookingId,
      revision: data.revision,
    });
    console.log('[E2E] cancel response:', JSON.stringify(cancelled.json));
    expect(cancelled.ok, `cancel debia responder 200: ${JSON.stringify(cancelled.json)}`).toBe(true);
    expect(cancelled.json.cancelled).toBe(true);
  });
});
