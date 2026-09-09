import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const START_OF_DAY = Date.parse('2026-09-15T09:00:00.000Z');
const MINUTE = 60_000;
const LEDGER_SEED = '0'.repeat(64);

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function interval(startMinute, durationMinutes) {
  return {
    start: START_OF_DAY + startMinute * MINUTE,
    end: START_OF_DAY + (startMinute + durationMinutes) * MINUTE,
  };
}

function overlaps(left, right) {
  return left.start < right.end && left.end > right.start;
}

class RealisticWixFlowSimulator {
  constructor({ now = START_OF_DAY - MINUTE } = {}) {
    this.now = now;
    this.agenda = [];
    this.citas = new Map();
    this.checkouts = new Map();
    this.inventory = new Map([['CHAMP_SIM', 10], ['TAZA_SIM', 4]]);
    this.processed = new Map();
    this.ledger = [];
    this.refunds = new Set();
    this.sequence = 0;
  }

  _idempotent(token, payload, operation) {
    const payloadHash = hash(payload);
    const previous = this.processed.get(token);
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw new Error('IDEMPOTENCY_CONFLICT');
      return { ...previous.result, idempotent: true };
    }
    const result = operation();
    this.processed.set(token, { payloadHash, result });
    return { ...result, idempotent: false };
  }

  _assertAgendaAvailable(resourceId, candidate) {
    if (this.agenda.some((entry) => entry.resourceId === resourceId && overlaps(entry, candidate))) {
      throw new Error('SLOT_UNAVAILABLE');
    }
  }

  _createAgendaEntry({ serviceId, resourceId, phase, time, reservationToken }) {
    this._assertAgendaAvailable(resourceId, time);
    const bookingId = `booking_${String(++this.sequence).padStart(4, '0')}`;
    const entry = { bookingId, serviceId, resourceId, phase, reservationToken, ...time };
    this.agenda.push(entry);
    this.citas.set(bookingId, {
      bookingId,
      resourceId,
      serviceId,
      status: 'CONFIRMED',
      statusPago: 'UNPAID',
      traceId: `trace_${reservationToken}`,
    });
    return entry;
  }

  reserveSimple({ token, startMinute, resourceId = 'marian' }) {
    return this._idempotent(token, { type: 'SIMPLE', startMinute, resourceId }, () => {
      const time = interval(startMinute, 20);
      if (time.start <= this.now) throw new Error('SLOT_IN_PAST');
      const booking = this._createAgendaEntry({
        serviceId: 'service_simple',
        resourceId,
        phase: 'F1',
        time,
        reservationToken: token,
      });
      return { bookingIds: [booking.bookingId], total: 15, requiresPayment: true };
    });
  }

  reserveDual({ token, startMinute, resourceId = 'marian' }) {
    return this._idempotent(token, { type: 'DUAL', startMinute, resourceId }, () => {
      const phaseOne = interval(startMinute, 30);
      const phaseTwo = interval(startMinute + 60, 40);
      if (phaseOne.start <= this.now) throw new Error('SLOT_IN_PAST');
      const created = [];
      try {
        created.push(this._createAgendaEntry({
          serviceId: 'service_dual_f1', resourceId, phase: 'F1', time: phaseOne, reservationToken: token,
        }));
        created.push(this._createAgendaEntry({
          serviceId: 'service_dual_f2', resourceId, phase: 'F2', time: phaseTwo, reservationToken: token,
        }));
        return {
          bookingIds: created.map((entry) => entry.bookingId),
          gap: interval(startMinute + 30, 30),
          total: 70,
          requiresPayment: true,
        };
      } catch (error) {
        const ids = new Set(created.map((entry) => entry.bookingId));
        this.agenda = this.agenda.filter((entry) => !ids.has(entry.bookingId));
        for (const bookingId of ids) this.citas.delete(bookingId);
        throw error;
      }
    });
  }

  createCheckout({ checkoutToken, bookingIds = [], productLines = [], amount }) {
    return this._idempotent(checkoutToken, { bookingIds, productLines, amount }, () => {
      for (const bookingId of bookingIds) {
        const cita = this.citas.get(bookingId);
        if (!cita) throw new Error('BOOKING_NOT_FOUND');
        cita.statusPago = 'PENDING_PAYMENT';
      }
      const checkoutId = `checkout_${String(++this.sequence).padStart(4, '0')}`;
      const checkout = { checkoutId, bookingIds: [...bookingIds], productLines: [...productLines], amount, status: 'PENDING' };
      this.checkouts.set(checkoutId, checkout);
      return checkout;
    });
  }

  _appendLedger({ transactionId, kind, amount, orderId, bookingIds, refundId = null }) {
    const prevHash = this.ledger.at(-1)?.hashCadena || LEDGER_SEED;
    const sequence = this.ledger.length + 1;
    const payload = { sequence, transactionId, kind, amount, orderId, bookingIds, refundId, prevHash };
    const movement = { ...payload, hashCadena: hash(payload), firmaDigital: hash(`fiscal|${hash(payload)}`) };
    this.ledger.push(movement);
    return movement;
  }

  paymentWebhook({ token, checkoutId, orderId }) {
    return this._idempotent(token, { checkoutId, orderId }, () => {
      const checkout = this.checkouts.get(checkoutId);
      if (!checkout) throw new Error('CHECKOUT_NOT_FOUND');
      if (checkout.status !== 'PENDING') throw new Error('CHECKOUT_NOT_PAYABLE');
      checkout.status = 'PAID';
      for (const bookingId of checkout.bookingIds) this.citas.get(bookingId).statusPago = 'PAID';
      for (const line of checkout.productLines) {
        const stock = this.inventory.get(line.sku);
        if (!Number.isFinite(stock)) throw new Error('PRODUCT_NOT_FOUND');
        this.inventory.set(line.sku, stock - line.quantity);
      }
      const movement = this._appendLedger({
        transactionId: `ORDER-${orderId}`,
        kind: 'ONLINE_PAYMENT',
        amount: checkout.amount,
        orderId,
        bookingIds: checkout.bookingIds,
      });
      return { orderId, movementId: movement.transactionId, bookingIds: checkout.bookingIds, status: 'PAID' };
    });
  }

  refundWebhook({ token, orderId, refundId, restockLines = [] }) {
    return this._idempotent(token, { orderId, refundId, restockLines }, () => {
      const original = this.ledger.find((movement) => movement.transactionId === `ORDER-${orderId}`);
      if (!original) throw new Error('ORIGINAL_PAYMENT_NOT_FOUND');
      if (this.refunds.has(refundId)) throw new Error('REFUND_ALREADY_PROCESSED');
      this.refunds.add(refundId);
      for (const line of restockLines) {
        const stock = this.inventory.get(line.sku);
        if (!Number.isFinite(stock)) throw new Error('PRODUCT_NOT_FOUND');
        this.inventory.set(line.sku, stock + line.quantity);
      }
      const movement = this._appendLedger({
        transactionId: `REFUND-${orderId}-${refundId}`,
        kind: 'ONLINE_REFUND',
        amount: -original.amount,
        orderId,
        bookingIds: original.bookingIds,
        refundId,
      });
      for (const bookingId of original.bookingIds) this.citas.get(bookingId).statusPago = 'REFUNDED';
      return { refundId, movementId: movement.transactionId, status: 'REFUNDED' };
    });
  }

  closeDay() {
    let previous = LEDGER_SEED;
    for (const movement of this.ledger) {
      const payload = { sequence: movement.sequence, transactionId: movement.transactionId, kind: movement.kind, amount: movement.amount, orderId: movement.orderId, bookingIds: movement.bookingIds, refundId: movement.refundId, prevHash: movement.prevHash };
      if (movement.prevHash !== previous || movement.hashCadena !== hash(payload)) throw new Error('FISCAL_INTEGRITY_VIOLATION');
      previous = movement.hashCadena;
    }
    return {
      status: 'CLOSED',
      operations: this.ledger.length,
      total: this.ledger.reduce((sum, movement) => sum + movement.amount, 0),
      hashFin: previous,
    };
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

test('dual booking writes two agenda phases and allows a simple booking in its exposure gap', () => {
  const sim = new RealisticWixFlowSimulator();
  const dual = sim.reserveDual({ token: 'dual-qa-001', startMinute: 60 });
  const simple = sim.reserveSimple({ token: 'simple-gap-qa-001', startMinute: 90 });
  assert.deepEqual(dual.gap, interval(90, 30));
  assert.equal(simple.bookingIds.length, 1);
  assert.equal(sim.agenda.length, 3);
  assert.equal(sim.citas.size, 3);
});

test('simple, dual and exposure-gap bookings generate correlated records and one online transaction', () => {
  const sim = new RealisticWixFlowSimulator();
  const dual = sim.reserveDual({ token: 'dual-record-qa-001', startMinute: 60 });
  const simple = sim.reserveSimple({ token: 'simple-gap-record-qa-001', startMinute: 90 });
  const bookingIds = [...dual.bookingIds, ...simple.bookingIds];
  const checkout = sim.createCheckout({ checkoutToken: 'checkout-record-qa-001', bookingIds, amount: 85 });
  const payment = sim.paymentWebhook({ token: 'payment-record-qa-001', checkoutId: checkout.checkoutId, orderId: 'order-record-qa-001' });

  assert.deepEqual(payment.bookingIds, bookingIds);
  assert.equal(sim.ledger.length, 1);
  assert.deepEqual(sim.ledger[0].bookingIds, bookingIds);
  assert.equal(sim.citas.get(dual.bookingIds[0]).traceId, 'trace_dual-record-qa-001');
  assert.equal(sim.citas.get(dual.bookingIds[1]).traceId, 'trace_dual-record-qa-001');
  assert.equal(sim.citas.get(simple.bookingIds[0]).traceId, 'trace_simple-gap-record-qa-001');
  assert.ok(bookingIds.every((bookingId) => sim.citas.get(bookingId).statusPago === 'PAID'));
});

test('reservation rejects past slots and preserves token idempotency semantics', () => {
  const sim = new RealisticWixFlowSimulator({ now: START_OF_DAY + 60 * MINUTE });
  assert.throws(() => sim.reserveSimple({ token: 'past-qa-001', startMinute: 60 }), /SLOT_IN_PAST/);
  const first = sim.reserveSimple({ token: 'retry-qa-001', startMinute: 90 });
  const retry = sim.reserveSimple({ token: 'retry-qa-001', startMinute: 90 });
  assert.equal(first.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.throws(() => sim.reserveSimple({ token: 'retry-qa-001', startMinute: 120 }), /IDEMPOTENCY_CONFLICT/);
});

test('simulated checkout changes cita payment state only after its payment webhook and records one ledger movement', () => {
  const sim = new RealisticWixFlowSimulator();
  const booking = sim.reserveSimple({ token: 'checkout-booking-001', startMinute: 120 });
  const checkout = sim.createCheckout({ checkoutToken: 'checkout-qa-001', bookingIds: booking.bookingIds, productLines: [{ sku: 'CHAMP_SIM', quantity: 2 }], amount: 39 });
  assert.equal(sim.citas.get(booking.bookingIds[0]).statusPago, 'PENDING_PAYMENT');
  const paid = sim.paymentWebhook({ token: 'payment-qa-001', checkoutId: checkout.checkoutId, orderId: 'order-qa-001' });
  const retry = sim.paymentWebhook({ token: 'payment-qa-001', checkoutId: checkout.checkoutId, orderId: 'order-qa-001' });
  assert.equal(paid.status, 'PAID');
  assert.equal(retry.idempotent, true);
  assert.equal(sim.citas.get(booking.bookingIds[0]).statusPago, 'PAID');
  assert.equal(sim.inventory.get('CHAMP_SIM'), 8);
  assert.equal(sim.ledger.length, 1);
});

test('refund only restores stock explicitly confirmed as restocked and is idempotent', () => {
  const sim = new RealisticWixFlowSimulator();
  const checkout = sim.createCheckout({ checkoutToken: 'checkout-qa-002', productLines: [{ sku: 'TAZA_SIM', quantity: 1 }], amount: 12 });
  sim.paymentWebhook({ token: 'payment-qa-002', checkoutId: checkout.checkoutId, orderId: 'order-qa-002' });
  const refund = sim.refundWebhook({ token: 'refund-qa-002', orderId: 'order-qa-002', refundId: 'refund-a', restockLines: [] });
  const retry = sim.refundWebhook({ token: 'refund-qa-002', orderId: 'order-qa-002', refundId: 'refund-a', restockLines: [] });
  assert.equal(refund.status, 'REFUNDED');
  assert.equal(retry.idempotent, true);
  assert.equal(sim.inventory.get('TAZA_SIM'), 3);
  assert.equal(sim.ledger.length, 2);
});

test('ledger closes only with an unbroken payment and refund chain', () => {
  const sim = new RealisticWixFlowSimulator();
  const checkout = sim.createCheckout({ checkoutToken: 'checkout-qa-003', productLines: [{ sku: 'CHAMP_SIM', quantity: 1 }], amount: 18 });
  sim.paymentWebhook({ token: 'payment-qa-003', checkoutId: checkout.checkoutId, orderId: 'order-qa-003' });
  sim.refundWebhook({ token: 'refund-qa-003', orderId: 'order-qa-003', refundId: 'refund-b', restockLines: [{ sku: 'CHAMP_SIM', quantity: 1 }] });
  const close = sim.closeDay();
  assert.equal(close.status, 'CLOSED');
  assert.equal(close.operations, 2);
  assert.equal(close.total, 0);
  assert.match(close.hashFin, /^[0-9a-f]{64}$/);
});

for (const result of tests) {
  console.log(`${result.status}\t${result.name}`);
  if (result.detail) console.log(result.detail);
}
const failed = tests.filter((result) => result.status === 'FAIL');
console.log(`TOTAL=${tests.length} PASS=${tests.length - failed.length} FAIL=${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
