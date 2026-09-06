import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const SIMPLE = Object.freeze({ id: '00aba212-c9fa-42d3-8e53-eed4509d34f9', duration: 20, price: 15 });
const DUAL = Object.freeze({
  id: 'b372a7cb-02e1-41e9-b8c9-1029121bb701',
  phaseTwoId: '5d03ee5c-e9f7-414b-b252-5ed9c6071148',
  phaseOneDuration: 30,
  exposureDuration: 30,
  phaseTwoDuration: 40,
});

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function interval(start, duration) {
  return { start, end: start + duration };
}

function overlaps(left, right) {
  return left.start < right.end && left.end > right.start;
}

class BookingSimulator {
  constructor() {
    this.bookings = [];
    this.transactions = new Map();
    this.movements = new Map();
    this.sequence = 0;
  }

  _run(token, payload, operation) {
    const payloadHash = hash(payload);
    const existing = this.transactions.get(token);
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new Error('IDEMPOTENCY_CONFLICT');
      return { ...existing.result, idempotent: true };
    }
    const result = operation();
    this.transactions.set(token, { payloadHash, result });
    return { ...result, idempotent: false };
  }

  _assertAvailable(candidate) {
    if (this.bookings.some((booking) => overlaps(booking, candidate))) throw new Error('SLOT_UNAVAILABLE');
  }

  _createBooking(kind, serviceId, time, token) {
    this._assertAvailable(time);
    const booking = {
      id: `sim_booking_${String(++this.sequence).padStart(3, '0')}`,
      kind,
      serviceId,
      token,
      ...time,
      status: 'CREATED',
    };
    this.bookings.push(booking);
    return booking;
  }

  reserveSimple({ token, start, failPersist = false }) {
    const payload = { type: 'simple', start, failPersist };
    return this._run(token, payload, () => {
      const created = [];
      try {
        created.push(this._createBooking('SIMPLE', SIMPLE.id, interval(start, SIMPLE.duration), token));
        if (failPersist) throw new Error('PERSISTENCE_FAILED');
        return { status: 'CREATED', bookingIds: created.map((booking) => booking.id), amount: SIMPLE.price };
      } catch (error) {
        this.bookings = this.bookings.filter((booking) => !created.includes(booking));
        throw error;
      }
    });
  }

  reserveDual({ token, start, failPhaseTwo = false, failPersist = false }) {
    const payload = { type: 'dual', start, failPhaseTwo, failPersist };
    return this._run(token, payload, () => {
      const phaseOne = interval(start, DUAL.phaseOneDuration);
      const phaseTwo = interval(start + DUAL.phaseOneDuration + DUAL.exposureDuration, DUAL.phaseTwoDuration);
      const created = [];
      try {
        this._assertAvailable(phaseOne);
        this._assertAvailable(phaseTwo);
        created.push(this._createBooking('DUAL_F1', DUAL.id, phaseOne, token));
        if (failPhaseTwo) throw new Error('PHASE_TWO_FAILED');
        created.push(this._createBooking('DUAL_F2', DUAL.phaseTwoId, phaseTwo, token));
        if (failPersist) throw new Error('PERSISTENCE_FAILED');
        return {
          status: 'CREATED',
          bookingIds: created.map((booking) => booking.id),
          exposure: interval(phaseOne.end, DUAL.exposureDuration),
        };
      } catch (error) {
        this.bookings = this.bookings.filter((booking) => !created.includes(booking));
        throw error;
      }
    });
  }

  recordPayment({ token, kind, amount, method, orderId = null, bookingIds = [] }) {
    return this._run(token, { type: 'payment', kind, amount, method, orderId, bookingIds }, () => {
      const movement = {
        id: `sim_movement_${String(++this.sequence).padStart(3, '0')}`,
        kind,
        amount,
        method,
        orderId,
        bookingIds: [...bookingIds],
        status: 'PAID',
      };
      this.movements.set(movement.id, movement);
      return { status: 'PAID', movementId: movement.id, amount, method, orderId, bookingIds: [...bookingIds] };
    });
  }

  refund({ token, movementId }) {
    return this._run(token, { type: 'refund', movementId }, () => {
      const movement = this.movements.get(movementId);
      if (!movement || movement.status !== 'PAID') throw new Error('REFUND_NOT_ALLOWED');
      movement.status = 'REFUNDED';
      const refund = {
        id: `sim_refund_${String(++this.sequence).padStart(3, '0')}`,
        kind: `REFUND_${movement.kind}`,
        amount: -movement.amount,
        method: movement.method,
        status: 'REFUNDED',
      };
      this.movements.set(refund.id, refund);
      return { status: 'REFUNDED', movementId, refundId: refund.id, amount: refund.amount };
    });
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

test('simple booking is created and idempotent', () => {
  const sim = new BookingSimulator();
  const first = sim.reserveSimple({ token: 'simple-1', start: 540 });
  const retry = sim.reserveSimple({ token: 'simple-1', start: 540 });
  assert.equal(first.status, 'CREATED');
  assert.equal(retry.idempotent, true);
  assert.equal(sim.bookings.length, 1);
});

test('dual booking leaves the exposure window available for a simple booking', () => {
  const sim = new BookingSimulator();
  const dual = sim.reserveDual({ token: 'dual-1', start: 540 });
  const simple = sim.reserveSimple({ token: 'simple-gap-1', start: 570 });
  assert.deepEqual(dual.exposure, { start: 570, end: 600 });
  assert.equal(simple.status, 'CREATED');
  assert.equal(sim.bookings.length, 3);
});

test('overlap is rejected and a dual failure compensates phase one', () => {
  const sim = new BookingSimulator();
  sim.reserveSimple({ token: 'occupied', start: 540 });
  assert.throws(() => sim.reserveSimple({ token: 'overlap', start: 550 }), /SLOT_UNAVAILABLE/);
  const empty = new BookingSimulator();
  assert.throws(() => empty.reserveDual({ token: 'dual-fail', start: 540, failPhaseTwo: true }), /PHASE_TWO_FAILED/);
  assert.equal(empty.bookings.length, 0);
});

test('persistence failure compensates all created bookings', () => {
  const sim = new BookingSimulator();
  assert.throws(() => sim.reserveDual({ token: 'persist-fail', start: 540, failPersist: true }), /PERSISTENCE_FAILED/);
  assert.equal(sim.bookings.length, 0);
});

test('same token with another payload is rejected', () => {
  const sim = new BookingSimulator();
  sim.reserveSimple({ token: 'conflict-1', start: 540 });
  assert.throws(() => sim.reserveSimple({ token: 'conflict-1', start: 600 }), /IDEMPOTENCY_CONFLICT/);
});

test('local, product-only and mixed online payments are traceable and refund only once', () => {
  const sim = new BookingSimulator();
  const local = sim.recordPayment({ token: 'cash-1', kind: 'BOOKING', amount: 15, method: 'CASH', bookingIds: ['sim_booking_001'] });
  const productOnly = sim.recordPayment({ token: 'store-1', kind: 'STORE_ORDER', amount: 24, method: 'ONLINE', orderId: 'store-1', bookingIds: [] });
  const mixed = sim.recordPayment({ token: 'mixed-1', kind: 'MIXED_ORDER', amount: 39, method: 'ONLINE', orderId: 'mixed-1', bookingIds: ['sim_booking_001'] });
  const refund = sim.refund({ token: 'refund-1', movementId: productOnly.movementId });
  assert.equal(local.status, 'PAID');
  assert.equal(productOnly.status, 'PAID');
  assert.deepEqual(productOnly.bookingIds, []);
  assert.deepEqual(mixed.bookingIds, ['sim_booking_001']);
  assert.equal(refund.amount, -24);
  assert.throws(() => sim.refund({ token: 'refund-2', movementId: productOnly.movementId }), /REFUND_NOT_ALLOWED/);
});

for (const result of tests) {
  console.log(`${result.status}\t${result.name}`);
  if (result.detail) console.log(result.detail);
}
const failed = tests.filter((result) => result.status === 'FAIL');
console.log(`TOTAL=${tests.length} PASS=${tests.length - failed.length} FAIL=${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
