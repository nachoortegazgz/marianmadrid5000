import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ============================================================================
// verify-core.mjs (v2 canonica - Biblia v5002.4)
// Guardian arquitectonico: valida el SSOT de colecciones contra el esquema CMS
// canonico, los hooks de inmutabilidad, la Saga transaccional, el facade
// webMethod V3, la prohibicion de IDs legacy y el estandar G10 ASCII.
// Fixtures: tests/cms-contract.json y tests/cms-schema-canonical.json
// (regenerar con: node scripts/generate-cms-fixtures.mjs)
// ============================================================================
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'cms-contract.json'), 'utf8'));
const canonicalSchema = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'cms-schema-canonical.json'), 'utf8'));
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function allFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? allFiles(absolute) : [absolute];
  });
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

function check(name, test) {
  try {
    test();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: error.message });
  }
}

check('Facade V3: webMethods usan wix-web-module y nunca @wix/web-methods', () => {
  const webModules = allFiles(path.join(root, 'src', 'backend')).filter((file) => file.endsWith('.web.js'));
  assert.ok(webModules.length >= 8, `se esperaban >=8 modulos .web.js y hay ${webModules.length}`);
  for (const file of webModules) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /from "wix-web-module"/, path.relative(root, file));
    assert.equal(source.includes('@wix/web-methods'), false, path.relative(root, file));
  }
  const security = read('src/backend/security.web.js');
  assert.ok(security.includes('checkStaffCollaboratorAccess'), 'security.web expone checkStaffCollaboratorAccess');
  const assistant = read('src/backend/marianAssistant.web.js');
  assert.ok(assistant.includes('requireMarianManager'), 'marianAssistant protege con requireMarianManager');
});

check('SSOT: internalConfig.js y cms-contract.json son identicos', () => {
  const config = read('src/backend/internalConfig.js');
  const block = config.slice(config.indexOf('export const COLLECTIONS'), config.indexOf('export const APP_IDS'));
  const parsed = {};
  for (const m of block.matchAll(/([A-Z_0-9]+):\s*"([^"]+)"/g)) parsed[m[1]] = m[2];
  assert.deepEqual(parsed, contract.collections, 'divergencia entre internalConfig.js y cms-contract.json');
  assert.deepEqual(contract.schemaExempt || [], ['BookingsServiceSyncQueue', 'SlotLocks', 'RateLimitBlocks', 'AlertasOperativas']);
});
// === PARTE 2 CONTINUA A CONTINUACION ===

check('Esquema CMS canonico cubre el SSOT y declara los campos criticos', () => {
  const schemaById = new Map(canonicalSchema.collections.map((collection) => [collection.id, collection]));
  for (const [key, collectionId] of Object.entries(contract.collections)) {
    if ((contract.schemaExempt || []).includes(collectionId)) continue;
    assert.ok(schemaById.has(collectionId), `${key}: falta ${collectionId} en cms-schema-canonical.json`);
  }
  for (const collection of canonicalSchema.collections) {
    const fieldIds = new Set(collection.fields.map(([fieldId]) => fieldId));
    assert.ok(fieldIds.size > 0, `${collection.id} sin campos parseados`);
    for (const index of collection.indexes || []) {
      for (const fieldId of index.filter((value) => typeof value === 'string')) {
        assert.ok(fieldIds.has(fieldId) || fieldId === '_id', `${collection.id}.${fieldId} indexa un campo inexistente`);
      }
    }
  }
  const requiredFields = {
    ServiciosCatalogo: ['slugUrl', 'serviceType', 'phase1Duration', 'onlinePayment', 'inPersonPayment', 'allowCombine', 'linkedPhases', 'price', 'totalDuration'],
    CitasF2: ['bookingId', 'paymentStatus', 'dateYmd', 'bookingType', 'pairToken', 'status'],
    RegistrosHorariosStaff: ['recordedAt', 'recordedTime', 'dayKey', 'monthKey', 'clockEventType', 'adjustmentReason', 'registeredByMemberId'],
    MovimientosInventario: ['movementToken', 'quantityDelta', 'requiresWixReconciliation', 'sku', 'stockExpected', 'orderId', 'refundId'],
    MmAuditLog: ['resourceId', 'traceId', 'data'],
  };
  for (const [collectionId, fields] of Object.entries(requiredFields)) {
    const collection = schemaById.get(collectionId);
    assert.ok(collection, `falta ${collectionId}`);
    const fieldIds = new Set(collection.fields.map(([fieldId]) => fieldId));
    for (const fieldId of fields) {
      assert.ok(fieldIds.has(fieldId), `${collectionId} no declara ${fieldId}`);
    }
  }
});
// === PARTE 3 CONTINUA A CONTINUACION ===

check('Hooks de datos: inmutabilidad fiscal y laboral intacta en data.js', () => {
  const dataHooks = read('src/backend/data.js');
  const requiredHooks = [
    'ServiciosCatalogo_beforeInsert', 'ServiciosCatalogo_beforeUpdate',
    'MapaStaff_beforeInsert', 'MapaStaff_beforeUpdate',
    'CitasF2_beforeInsert', 'CitasF2_beforeUpdate',
    'MovimientosCaja_beforeInsert', 'MovimientosCaja_beforeUpdate', 'MovimientosCaja_beforeRemove',
    'RegistrosHorariosStaff_beforeInsert', 'RegistrosHorariosStaff_beforeUpdate', 'RegistrosHorariosStaff_beforeRemove',
    'HistoricoCierresZ_beforeUpdate', 'HistoricoCierresZ_beforeRemove',
    'CajaActual_beforeInsert', 'CajaActual_beforeUpdate', 'CajaActual_beforeRemove',
  ];
  for (const hook of requiredHooks) {
    assert.ok(dataHooks.includes(`function ${hook}`), `falta hook ${hook}`);
  }
  for (const token of ['FISCAL_VIOLATION', 'LABOR_LOG_VIOLATION', 'SINGLETON_PROTECTED', 'CITAS_VIOLATION']) {
    assert.ok(dataHooks.includes(token), `falta token de proteccion ${token}`);
  }
});

check('Reserva transaccional conserva Saga, locks, idempotencia y compensacion', () => {
  const saga = read('src/backend/booking/bookingSaga.js');
  const core = read('src/backend/booking/bookingCore.js');
  for (const token of ['BookingSagaOrchestrator', 'executeBookingSaga', '_rollback']) assert.ok(saga.includes(token), token);
  for (const token of ['_initTransaction', '_lockSlotKeyOrFail', '_unlockSlotKey', 'pairToken', '_buildLockKeys', 'lockKey']) assert.ok(core.includes(token), token);
  assert.equal(/\.forEach\(\s*async\b/.test(saga), false, 'forEach async prohibido en la Saga');
});

check('Servicios invalidan la cache dual de disponibilidad', () => {
  const reservations = read('src/backend/reservas.web.js');
  for (const token of ['_invalidateCachesInternal', 'COLLECTIONS.DUAL_SLOT_CACHE', 'COLLECTIONS.AVAILABILITY_DAYS_CACHE']) {
    assert.ok(reservations.includes(token), token);
  }
});

check('Cero IDs legacy en src (Matriz Biblia v5002.4)', () => {
  const banned = [
    'CONCILIACION_STOCK_WIX', 'SYNC_M365', 'AVAILABILITY_SLOTS_CACHE', 'CONTADORES_FISCALES',
    'PendingCompensations', 'ConciliacionStockWix', 'AvailabilitySlotsCache', 'ContadoresFiscales',
    'statusPago', 'fechaYmdMadrid', 'tipoServicio', 'tiempoFase1', 'pagoOnline', 'pagoPresencial',
    'idFactura', 'primaryServiceGuid', 'secondaryServiceGuid', 'linkFases', 'permitirCombinar',
    'ComplementosCatalogo', 'SERVICIOS_RESERVA', 'HISTORICOCIERRESZ', 'MmLocks', 'CierresZ',
  ];
  // Excepciones documentadas (REFACTOR_BIBLE_v5002.4.md):
  // data.js lee el campo legacy tiempoFase1 unicamente para re-escribir el
  // canonico phase1Duration en registros CMS antiguos (camino de migracion).
  const allowlist = {
    'src/backend/data.js': ['tiempoFase1'],
  };
  const files = allFiles(path.join(root, 'src')).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const relative = path.relative(root, file);
    const allowed = allowlist[relative] || [];
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    for (const token of banned) {
      if (allowed.includes(token)) continue;
      // \b evita falsos positivos por subcadena (ej: 'CierresZ' dentro de 'HistoricoCierresZ')
      const tokenRe = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      assert.ok(!tokenRe.test(source), `${relative} contiene legacy "${token}"`);
    }
  }
});

check('Fuentes JavaScript mantienen sintaxis valida y estandar G10 ASCII', () => {
  const files = allFiles(path.join(root, 'src')).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(/[\u0000-\u001F\u007F-\uFFFF]/.test(source.replace(/\n|\t|\r/g, '')), false, `No ASCII: ${path.relative(root, file)}`);
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
});

for (const result of results) {
  console.log(`${result.status}\t${result.name}`);
  if (result.detail) console.log(result.detail);
}

const failed = results.filter((result) => result.status === 'FAIL');
console.log(`TOTAL=${results.length} PASS=${results.length - failed.length} FAIL=${failed.length}`);
process.exitCode = failed.length ? 1 : 0;


