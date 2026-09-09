import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const SEED_SIGNATURE = '0'.repeat(64);
const FISCAL_KEY = 'simulated-fiscal-key';
const DAY = '2026-08-25';

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hmac(value) {
  return crypto.createHmac('sha256', FISCAL_KEY).update(String(value)).digest('hex');
}

class AdministrationClosingSimulator {
  constructor({ isMarianManager }) {
    this.isMarianManager = isMarianManager;
    this.movements = [];
    this.xCounts = [];
    this.zClosings = new Map();
    this.sequence = 0;
  }

  _requireMarian() {
    if (!this.isMarianManager) throw new Error('ACCESS_DENIED');
  }

  loadContext() {
    this._requireMarian();
    return {
      isMarianManager: true,
      cashierState: { day: DAY, status: 'ABIERTA' },
      inventory: { totalProducts: 1, pendingReconciliationCount: 0 },
      inventoryQueue: [],
    };
  }

  registerTpvTransaction({ amount, paymentMethod, kind = 'VENTA', concept, traceId }) {
    this._requireMarian();
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('INVALID_AMOUNT');
    if (!['EFECTIVO', 'TARJETA', 'BIZUM'].includes(paymentMethod)) throw new Error('INVALID_PAYMENT_METHOD');
    if (!['VENTA', 'PROPINA'].includes(kind)) throw new Error('INVALID_MOVEMENT_KIND');
    if (!String(concept || '').trim()) throw new Error('INVALID_CONCEPT');

    const seqGlobal = ++this.sequence;
    const importeTotal = roundMoney(amount);
    const isTip = kind === 'PROPINA';
    const tipoMovimiento = isTip ? 'PROPINA' : `VENTA_${paymentMethod}`;
    const tasaIva = isTip ? 0 : 0.21;
    const baseImponible = isTip ? 0 : roundMoney(importeTotal / (1 + tasaIva));
    const cuotaIva = isTip ? 0 : roundMoney(importeTotal - baseImponible);
    const naturalezaOperacion = isTip ? 'PROPINA' : 'VENTA';
    const tratamientoIva = isTip ? 'PROPINA_PENDIENTE_GESTORIA' : 'IVA_GENERAL';
    const detalleLineas = [{ linea: 1, descripcion: concept, baseImponible, cuotaIva, tasaIva, importeTotal }];
    const prevHash = this.movements.at(-1)?.hashCadena || SEED_SIGNATURE;
    const transactionId = `ADMIN_TPV_${DAY}_${String(seqGlobal).padStart(4, '0')}`;
    const payload = [seqGlobal, tipoMovimiento, importeTotal, baseImponible, cuotaIva, tratamientoIva, JSON.stringify(detalleLineas), transactionId, prevHash].join('|');
    const hashCadena = sha256(`${prevHash}|${payload}`);
    const movement = {
      seqGlobal,
      tipoMovimiento,
      concepto: concept,
      origen: isTip ? 'ADMINISTRACION_TPV_PROPINA' : 'ADMINISTRACION_TPV',
      importeTotal,
      importeContable: importeTotal,
      baseImponible,
      cuotaIva,
      tasaIva,
      naturalezaOperacion,
      tratamientoIva,
      referenciaRectificativa: null,
      detalleLineas,
      integrityPayloadVersion: 'LEDGER_V2',
      formaPago: paymentMethod,
      numTicketFactura: `SIM-${DAY.replaceAll('-', '')}-${String(seqGlobal).padStart(4, '0')}`,
      transactionId,
      diaKey: DAY,
      traceId,
      prevHash,
      hashCadena,
      firmaDigital: `${hmac(payload)}|${hashCadena}`,
    };
    this.movements.push(movement);
    return movement;
  }

  registerXCount({ metalicoCaja, traceId }) {
    this._requireMarian();
    if (!Number.isFinite(Number(metalicoCaja)) || Number(metalicoCaja) < 0) throw new Error('INVALID_X_COUNT');
    const totalEfectivoTeorico = roundMoney(this.movements
      .filter((movement) => movement.formaPago === 'EFECTIVO')
      .reduce((total, movement) => total + movement.importeContable, 0));
    const counted = roundMoney(metalicoCaja);
    const xCount = {
      diaKey: DAY,
      metalicoCaja: counted,
      totalEfectivoTeorico,
      descuadre: roundMoney(counted - totalEfectivoTeorico),
      estadoCuadre: counted === totalEfectivoTeorico ? 'CUADRADO' : 'DESCUADRADO',
      traceId,
    };
    this.xCounts.push(xCount);
    return xCount;
  }

  _verifyIntegrity() {
    let previous = SEED_SIGNATURE;
    for (const movement of this.movements) {
      const payload = [movement.seqGlobal, movement.tipoMovimiento, movement.importeTotal, movement.baseImponible, movement.cuotaIva, movement.tratamientoIva, JSON.stringify(movement.detalleLineas), movement.transactionId, movement.prevHash].join('|');
      if (movement.prevHash !== previous || movement.hashCadena !== sha256(`${previous}|${payload}`)) return false;
      previous = movement.hashCadena;
    }
    return true;
  }

  registerZClosing({ traceId }) {
    this._requireMarian();
    const existing = this.zClosings.get(DAY);
    if (existing) return { ...existing, idempotent: true };
    if (!this._verifyIntegrity()) throw new Error('FISCAL_INTEGRITY_VIOLATION');

    const byPayment = { EFECTIVO: 0, TARJETA: 0, BIZUM: 0, ONLINE: 0 };
    const byType = {};
    const byVat = {};
    let baseImponibleNeta = 0;
    let cuotaIvaNeta = 0;
    let totalVentas = 0;
    let totalPropinas = 0;
    for (const movement of this.movements) {
      byPayment[movement.formaPago] = roundMoney((byPayment[movement.formaPago] || 0) + movement.importeContable);
      byType[movement.tipoMovimiento] = roundMoney((byType[movement.tipoMovimiento] || 0) + movement.importeContable);
      const vatKey = String(movement.tasaIva);
      byVat[vatKey] ||= { baseImponible: 0, cuotaIva: 0, total: 0, operaciones: 0 };
      byVat[vatKey].baseImponible = roundMoney(byVat[vatKey].baseImponible + movement.baseImponible);
      byVat[vatKey].cuotaIva = roundMoney(byVat[vatKey].cuotaIva + movement.cuotaIva);
      byVat[vatKey].total = roundMoney(byVat[vatKey].total + movement.importeContable);
      byVat[vatKey].operaciones++;
      baseImponibleNeta = roundMoney(baseImponibleNeta + movement.baseImponible);
      cuotaIvaNeta = roundMoney(cuotaIvaNeta + movement.cuotaIva);
      if (movement.tipoMovimiento === 'PROPINA') totalPropinas = roundMoney(totalPropinas + movement.importeContable);
      else totalVentas = roundMoney(totalVentas + movement.importeContable);
    }

    const first = this.movements[0] || null;
    const last = this.movements.at(-1) || null;
    const summary = {
      version: 'Z_V2',
      diaKey: DAY,
      timezone: 'Europe/Madrid',
      source: 'ADMIN',
      seqInicio: first?.seqGlobal || 0,
      seqFin: last?.seqGlobal || 0,
      hashInicio: first?.prevHash || SEED_SIGNATURE,
      hashFin: last?.hashCadena || SEED_SIGNATURE,
      ticketInicio: first?.numTicketFactura || '',
      ticketFin: last?.numTicketFactura || '',
      totalEfectivo: roundMoney(byPayment.EFECTIVO),
      totalTarjeta: roundMoney(byPayment.TARJETA),
      totalBizum: roundMoney(byPayment.BIZUM),
      totalOnline: roundMoney(byPayment.ONLINE),
      totalVentas,
      totalReembolsos: 0,
      totalPropinas,
      totalAjustes: 0,
      baseImponibleNeta,
      cuotaIvaNeta,
      resumenTiposMovimiento: byType,
      resumenTipoIva: byVat,
      numOperaciones: this.movements.length,
      integridadVerificada: true,
      totalRegistrosVerificados: this.movements.length,
    };
    const hashCierre = sha256(`${summary.hashFin}|${JSON.stringify(summary)}`);
    const closing = {
      _id: `Z_${DAY}`,
      ...summary,
      totalGeneral: roundMoney(summary.totalEfectivo + summary.totalTarjeta + summary.totalBizum + summary.totalOnline),
      estado: 'CERRADA',
      fechaCierre: '2026-08-25T22:00:00.000Z',
      fechaVerificacion: '2026-08-25T22:00:00.000Z',
      hashCierre,
      firmaCierre: hmac(hashCierre),
      traceId,
    };
    this.zClosings.set(DAY, closing);
    return { ...closing, idempotent: false };
  }
}

const tests = [];
function test(name, fn) {
  try {
    fn();
    tests.push({ name, status: 'PASS' });
  } catch (error) {
    tests.push({ name, status: 'FAIL', detail: error.message });
  }
}

test('ADMINISTRACION rejects a non-Marian session before loading cash management', () => {
  const sim = new AdministrationClosingSimulator({ isMarianManager: false });
  assert.throws(() => sim.loadContext(), /ACCESS_DENIED/);
  assert.equal(sim.movements.length, 0);
  assert.equal(sim.zClosings.size, 0);
});

test('ADMINISTRACION completes a daily X and Z close with detailed immutable evidence', () => {
  const sim = new AdministrationClosingSimulator({ isMarianManager: true });
  const context = sim.loadContext();
  const cash = sim.registerTpvTransaction({ amount: 41.5, paymentMethod: 'EFECTIVO', concept: 'Venta local simulada', traceId: 'trace-admin-001' });
  const card = sim.registerTpvTransaction({ amount: 25, paymentMethod: 'TARJETA', concept: 'Venta tarjeta simulada', traceId: 'trace-admin-002' });
  const bizum = sim.registerTpvTransaction({ amount: 10, paymentMethod: 'BIZUM', concept: 'Venta Bizum simulada', traceId: 'trace-admin-003' });
  const tip = sim.registerTpvTransaction({ amount: 8, paymentMethod: 'EFECTIVO', kind: 'PROPINA', concept: 'Propina local simulada', traceId: 'trace-admin-004' });
  const xCount = sim.registerXCount({ metalicoCaja: 49.5, traceId: 'trace-admin-x' });
  const zClosing = sim.registerZClosing({ traceId: 'trace-admin-z' });
  const retry = sim.registerZClosing({ traceId: 'trace-admin-z-retry' });

  assert.equal(context.isMarianManager, true);
  assert.equal(cash.prevHash, SEED_SIGNATURE);
  assert.equal(card.prevHash, cash.hashCadena);
  assert.equal(bizum.prevHash, card.hashCadena);
  assert.equal(tip.prevHash, bizum.hashCadena);
  assert.equal(card.tipoMovimiento, 'VENTA_TARJETA');
  assert.equal(bizum.tipoMovimiento, 'VENTA_BIZUM');
  assert.equal(tip.tipoMovimiento, 'PROPINA');
  assert.equal(tip.tratamientoIva, 'PROPINA_PENDIENTE_GESTORIA');
  assert.equal(tip.baseImponible, 0);
  assert.equal(tip.cuotaIva, 0);
  assert.equal(xCount.estadoCuadre, 'CUADRADO');
  assert.equal(xCount.descuadre, 0);
  assert.equal(zClosing.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(zClosing.estado, 'CERRADA');
  assert.equal(zClosing.source, 'ADMIN');
  assert.equal(zClosing.numOperaciones, 4);
  assert.equal(zClosing.totalRegistrosVerificados, 4);
  assert.equal(zClosing.integridadVerificada, true);
  assert.equal(zClosing.totalEfectivo, 49.5);
  assert.equal(zClosing.totalTarjeta, 25);
  assert.equal(zClosing.totalBizum, 10);
  assert.equal(zClosing.totalGeneral, 84.5);
  assert.equal(zClosing.totalVentas, 76.5);
  assert.equal(zClosing.totalPropinas, 8);
  assert.equal(zClosing.totalReembolsos, 0);
  assert.equal(zClosing.totalAjustes, 0);
  assert.equal(zClosing.seqInicio, 1);
  assert.equal(zClosing.seqFin, 4);
  assert.equal(zClosing.ticketInicio, 'SIM-20260825-0001');
  assert.equal(zClosing.ticketFin, 'SIM-20260825-0004');
  assert.match(zClosing.hashCierre, /^[0-9a-f]{64}$/);
  assert.match(zClosing.firmaCierre, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(zClosing.resumenTiposMovimiento).sort(), ['PROPINA', 'VENTA_BIZUM', 'VENTA_EFECTIVO', 'VENTA_TARJETA']);
  assert.equal(zClosing.resumenTipoIva['0.21'].operaciones, 3);
  assert.equal(zClosing.resumenTipoIva['0'].operaciones, 1);
});

for (const result of tests) {
  console.log(`${result.status}\t${result.name}`);
  if (result.detail) console.log(result.detail);
}
const failed = tests.filter((result) => result.status === 'FAIL');
console.log(`TOTAL=${tests.length} PASS=${tests.length - failed.length} FAIL=${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
