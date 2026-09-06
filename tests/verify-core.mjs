import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const backend = path.join(src, 'backend');
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

function check(name, test) {
  try {
    test();
    results.push({ name, status: 'PASS' });
  } catch (error) {
    results.push({ name, status: 'FAIL', detail: error.message });
  }
}

check('Web Methods usan el contrato reconocido por el runtime Velo', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies['wix-web-module']);
  assert.equal(Object.hasOwn(pkg.dependencies, '@wix/web-methods'), false);
  assert.match(pkg.dependencies['@wix/bookings'], /^\^1\.0\.\d+$/);
  const webModules = allFiles(backend).filter((file) => file.endsWith('.web.js'));
  assert.equal(webModules.length, 8);
  for (const file of webModules) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /from "wix-web-module"/, path.relative(root, file));
    assert.equal(source.includes('@wix/web-methods'), false, path.relative(root, file));
  }
  const assistant = read('src/backend/marianAssistant.web.js');
  assert.ok(assistant.includes('requireMarianManager'));
  assert.ok(assistant.includes('store: false'));
  assert.equal(assistant.includes('registerBookingPayment'), false);
  assert.equal(assistant.includes('registerZClosing'), false);
});

check('ADMINISTRACION reutiliza el controlador exclusivo de Marian', () => {
  const controller = read('src/public/marianAdministrationController.js');
  const legacy = read('src/pages/ONLY STAFF.mvf3f.js');
  const administration = read('src/pages/ADMINISTRACION.mvf3f.js');
  for (const token of ['checkStaffCollaboratorAccess', 'askMarianAssistant', 'registerManualTransaction', 'registerXCount', 'registerZClosing', 'getInventoryDashboard', 'getQuarterlyTaxSummary']) assert.ok(controller.includes(token), token);
  assert.ok(legacy.includes('initMarianAdministration'));
  assert.ok(legacy.includes('#htmlOnlyStaff'));
  assert.ok(administration.includes('initMarianAdministration'));
  assert.ok(administration.includes('#htmlAdministracion'));
});

check('Contrato CMS: colecciones SSOT y campos canónicos', () => {
  const config = read('src/backend/internalConfig.js');
  for (const [key, value] of Object.entries(contract.collections)) {
    assert.match(config, new RegExp(`${key}:\\s*["']${value}["']`), `${key} -> ${value}`);
  }
  const serviceSource = read('src/backend/reservas.web.js');
  for (const field of ['serviceId', 'linkFases', 'permitirCombinar', 'phaseOneServiceId', 'phaseTwoServiceId']) {
    assert.ok(serviceSource.includes(field), field);
  }
  assert.equal(serviceSource.includes('primaryServiceGuid'), false);
  assert.equal(serviceSource.includes('secondaryServiceGuid'), false);
  const dataHooks = read('src/backend/data.js');
  assert.ok(dataHooks.includes('motivoAjuste is required for manual adjustments'));
  assert.ok(dataHooks.includes('item.hora = madrid.slice(11, 19)'));
});

check('Esquema CMS canónico cubre las colecciones y los índices activos del runtime', () => {
  const schemaById = new Map(canonicalSchema.collections.map((collection) => [collection.id, collection]));
  const configuredCollections = Object.values(contract.collections);
  for (const collectionId of configuredCollections) {
    assert.ok(schemaById.has(collectionId), `Falta ${collectionId} en cms-schema-canonical.json`);
  }
  assert.equal(schemaById.has('MapaStaff'), false);
  for (const collection of canonicalSchema.collections) {
    const fieldIds = new Set(collection.fields.map(([fieldId]) => fieldId));
    for (const index of collection.indexes || []) {
      for (const fieldId of index.filter((value) => typeof value === 'string')) {
        assert.ok(fieldIds.has(fieldId) || fieldId === '_id', `${collection.id}.${fieldId} indexa un campo inexistente`);
      }
    }
  }
  const labor = schemaById.get('REGISTRO_HORARIO');
  assert.ok(labor.fields.some(([fieldId]) => fieldId === 'motivoAjuste'));
  const stock = schemaById.get('InventarioProductos');
  assert.ok(stock.fields.some(([fieldId]) => fieldId === 'stockExpected'));
  for (const fieldId of ['productName', 'description', 'category', 'salePriceTaxIncluded', 'costExTax', 'supplier', 'supplierReference', 'unitsPerCase', 'lowStockAlert', 'reorderPoint', 'wixProductId', 'wixVariantId', 'needsWixReconciliation']) {
    assert.ok(stock.fields.some(([candidate]) => candidate === fieldId), `InventarioProductos no declara ${fieldId}`);
  }
  const inventoryMovement = schemaById.get('movimientoInventario');
  for (const fieldId of ['movementToken', 'productName', 'quantityDelta', 'requiresWixReconciliation', 'nativeCommercialMovement', 'wixProductId', 'wixVariantId', 'orderId', 'refundId']) {
    assert.ok(inventoryMovement.fields.some(([candidate]) => candidate === fieldId), `movimientoInventario no declara ${fieldId}`);
  }
});

check('Servicios invalidan todas las cachés y los complementos respetan el contrato CMS', () => {
  const dataHooks = read('src/backend/data.js');
  const reservations = read('src/backend/reservas.web.js');
  const saga = read('src/backend/booking/bookingSaga.js');
  for (const token of ['COLLECTIONS.DAYS_CACHE', 'COLLECTIONS.SLOTS_CACHE', 'DAYS_CACHE_COL, ["serviceId"]', 'SLOTS_CACHE_COL, ["phaseOneServiceId"]', '_invalidateServiceCaches(item.serviceId)', '_invalidateServiceCaches(item.linkFases)']) {
    assert.ok(dataHooks.includes(token), token);
  }
  for (const token of ['option?.precioAddon', 'option?.cantidadMaximaAddon', 'cantidadMaximaAddon']) assert.ok(reservations.includes(token), token);
  assert.equal(reservations.includes('bookingsAddonQuantity'), false);
  assert.equal(saga.includes('bookingsAddonQuantity'), false);
});

check('Defensas runtime cubren RBAC, citas y reservas pasadas sin ampliar permisos', () => {
  const security = read('src/backend/security.js');
  const dataHooks = read('src/backend/data.js');
  const saga = read('src/backend/booking/bookingSaga.js');
  const events = read('src/backend/events.js');
  for (const token of ['withTimeout(', 'MEMBER_FETCH_TIMEOUT_MS', 'getMemberFull']) assert.ok(security.includes(token), token);
  for (const token of ['CITAS_VIOLATION: Missing bookingId.', 'item.bookingId = bookingId']) assert.ok(dataHooks.includes(token), token);
  assert.ok(saga.includes('SLOT_IN_PAST'));
  assert.ok(events.includes(".in('bookingId', ids)"));
  assert.ok(events.includes('queryCitasForPaid'));
});

check('Recurso de personal y disponibilidad usan el tipo Wix confirmado', () => {
  const config = read('src/backend/internalConfig.js');
  assert.ok(config.includes('STAFF_RESOURCE_TYPE_ID: "1cd44cf8-756f-41c3-bd90-3e2ffcaf1155"'));
  const reservations = read('src/backend/reservas.web.js');
  assert.ok(reservations.includes('listAvailabilityTimeSlots'));
  assert.ok(reservations.includes('resolveStaffForSlot'));
});

check('Reserva transaccional conserva Saga, locks, idempotencia y compensacion', () => {
  const saga = read('src/backend/booking/bookingSaga.js');
  const core = read('src/backend/booking/bookingCore.js');
  for (const token of ['BookingSagaOrchestrator', 'executeBookingSaga', '_rollback']) assert.ok(saga.includes(token), token);
  for (const token of ['_initTransaction', '_lockSlotKeyOrFail', '_unlockSlotKey', 'pairToken', 'slotKey']) assert.ok(core.includes(token), token);
  assert.equal(/\.forEach\(\s*async\b/.test(saga), false);
});

check('Ledger eCommerce cubre pedidos sin reservas y evita devoluciones huerfanas', () => {
  const events = read('src/backend/events.js');
  const cashbox = read('src/backend/cajas.web.js');
  assert.equal(events.includes('if (!bookingIds || bookingIds.length === 0) return'), false);
  assert.ok(events.includes('registerBookingPayment(linkedBookingIds || null'));
  assert.ok(events.includes('WAIT_FOR_ORIGINAL_ORDER_LEDGER'));
  assert.ok(events.includes('recordOnlineInventoryRefundInternal'));
  assert.equal(cashbox.includes('!bookingIds || !Number.isFinite(amount)'), false);
  assert.ok(cashbox.includes('item.bookingIds || null'));
  assert.ok(cashbox.includes('WAIT_FOR_ORIGINAL_ORDER_LEDGER'));
  assert.ok(cashbox.includes('Daily fiscal movement query reached configured page cap'));
  for (const token of ['_upsertCurrentCashProjection', '_buildCashierProjection', 'totalEfectivoTeorico', 'estadoCuadre', 'concepto:', 'origen:', 'orderId: options.orderId', 'refundId: options.refundId', 'nifEmisor', 'projectLedgerMovementToAccounting', 'Accounting projection intentionally skipped']) assert.ok(cashbox.includes(token), token);
  assert.ok(events.includes("origen: 'WIX_ECOM_PAYMENT_WEBHOOK'"));
  assert.ok(events.includes("origen: 'WIX_ECOM_REFUND_WEBHOOK'"));
  assert.ok(events.includes('orderId,\n            refundId,\n            origen: \'WIX_ECOM_REFUND_WEBHOOK\','));
});

check('Proyeccion contable solo se activa con mapa validado y preserva partida doble', () => {
  const accounting = read('src/backend/contabilidad.js');
  for (const token of ['PLAN_CUENTAS_CONTABLES', 'ASIENTOS_CONTABLES', 'LINEAS_ASIENTO_CONTABLE', 'NO_APPROVED_ACCOUNT_MAP', 'ACCOUNTING_PROJECTION_UNBALANCED', 'totalDebe', 'totalHaber', 'hashAsiento', 'firmaAsiento']) assert.ok(accounting.includes(token), token);
  const dataHooks = read('src/backend/data.js');
  for (const token of ['ASIENTOS_CONTABLES_beforeInsert', 'ASIENTOS_CONTABLES_beforeUpdate', 'LINEAS_ASIENTO_CONTABLE_beforeInsert', 'LINEAS_ASIENTO_CONTABLE_beforeUpdate']) assert.ok(dataHooks.includes(token), token);
});

check('Cierre Z conserva resumen fiscal sellado y secuencia verificable', () => {
  const cashbox = read('src/backend/cajas.web.js');
  for (const token of ['_buildZClosingSummary', 'resumenTiposMovimiento', 'resumenTipoIva', 'seqInicio', 'seqFin', 'hashInicio', 'hashFin', 'hashCierre', 'firmaCierre', 'integridadVerificada']) assert.ok(cashbox.includes(token), token);
});

check('Registro laboral deriva el actor de la sesion y conserva su identificador', () => {
  const horario = read('src/backend/horario.web.js');
  assert.ok(horario.includes('registradoPorMemberId'));
  assert.equal(horario.includes("registradoPor: _safeTrim(payload.registradoPor)"), false);
});

check('Informes fiscales conservan desglose, origen y referencias del ledger', () => {
  const fiscal = read('src/backend/fiscalAggregator.web.js');
  for (const token of ['desgloseTipoIva', 'Number(m.tasaIva)', 'concepto:', 'origen:', 'orderId:', 'refundId:', 'fechaHoraRegistro:', 'FISCAL_RESULT_TRUNCATED']) assert.ok(fiscal.includes(token), token);
});

check('Cache, Jobs y rate limiter usan limites ejecutables por Wix', () => {
  const security = read('src/backend/security.js');
  const crons = read('src/backend/crons.js');
  const jobsSource = read('src/backend/jobs.config');
  const jobs = JSON.parse(jobsSource.replace(/^\/\/.*$/gm, ''));
  for (const token of ['MAX_RATE_LIMIT_CACHE_SIZE', '_ensureRateLimitCapacity', '_pruneExpiredRateLimitEntries']) assert.ok(security.includes(token), token);
  assert.ok(crons.includes('cleanExpiredSlotsCache'));
  assert.ok(jobs.jobs.length <= 20);
  for (const job of jobs.jobs) {
    assert.ok(crons.includes(`export async function ${job.functionName}`), job.functionName);
    const minute = String(job.executionConfig?.cronExpression || '').trim().split(/\s+/)[0];
    assert.equal(minute.includes('/'), false, `${job.functionName} usa una frecuencia subhoraria no ejecutable`);
  }
});

check('Configuracion externa y QR fiscal no usan valores de ejemplo ni CORS abierto', () => {
  const config = read('src/backend/internalConfig.js');
  const qrHelper = read('src/public/qrHelper.js');
  assert.equal(config.includes('CORS_ALLOWED_ORIGINS: ["*"]'), false);
  assert.equal(config.includes('12345678Z'), false);
  assert.equal(qrHelper.includes('12345678Z'), false);
  assert.ok(qrHelper.includes('configuracionFiscalCompleta'));
});

check('Fuentes JavaScript del proyecto mantienen sintaxis valida y formato G10', () => {
  const files = allFiles(src).filter((file) => file.endsWith('.js'));
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
