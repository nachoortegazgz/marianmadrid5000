#!/usr/bin/env node
import https from 'https';
import { createHmac } from 'crypto';  // ✅ Import agregado

const BASE = 'https://www.marianmadrid.es/_functions';
const SECRET = 'M365_WEBHOOK_SECRET';

const get = (url) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => resolve({ status: res.statusCode, body: data }));
  }).on('error', reject);
});

async function run() {
  console.log('🧪 [CANARY] Ejecutando smoke completo...\n');

  const results = [];

  let r = await get(`${BASE}/health`).catch(e => ({ status: 500, body: e.message }));
  results.push(['Health', r.status === 200 && r.body.includes('v5003.0-canary-e2e')]);

  r = await get(`${BASE}/get_services_list`).catch(e => ({ status: 500, body: e.message }));
  results.push(['Services List', r.body.includes('"servicioId"') && r.body.includes('"slugUrl"')]);

  r = await get(`${BASE}/get_service?slugUrl=masaje-relajacion`).catch(e => ({ status: 500, body: e.message }));
  results.push(['Service by slugUrl', r.status === 200 && r.body.includes('"name"')]);

  // Simular booking con datos placeholder válidos
  const body = JSON.stringify({
    servicioId: '00000000-0000-0000-0000-000000000000',
    employeeIdentifier: '00000000-0000-0000-0000-000000000000',
    dateYmd: '2026-07-15T11:00:00',
    cliente: { email: 'test-smoke-marian@test.com' }
  });

  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex').toUpperCase();

  r = await new Promise(resolve => {
    const req = https.request(`${BASE}/post_booking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mm-signature': sig,
        'x-mm-timestamp': ts,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', e => resolve({ status: 500, body: e.message }));
    req.write(body);
    req.end();
  });

  results.push(['Booking Dual', r.status === 200 && r.body.includes('CONFIRMED')]);

  console.log('\n📊 RESULTADOS CANARY:');
  for (const [name, pass] of results) {
    console.log(`${pass ? '✅' : '❌'} ${name}`);
  }

  process.exit(results.every(r => r[1]) ? 0 : 1);
}

run().catch(console.error);