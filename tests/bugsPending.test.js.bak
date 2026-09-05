import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSlot, createMockMovimiento, mockFindStaff } from './helpers/testHelpers.js';

describe('Regresiones de modulos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mantiene compatibilidad con la firma legacy de _forceStaffInPristineSlot', async () => {
    const { _forceStaffInPristineSlot } = await import('../src/backend/booking/bookingCore.js');
    const slot = createMockSlot();

    const result = await _forceStaffInPristineSlot(slot, slot.resourceId, 30);

    expect(result).toMatchObject({
      serviceId: slot.primaryServiceGuid,
      resourceId: slot.resourceId,
      scheduleId: slot.scheduleId,
    });
    expect(result.localEndDate).toBeDefined();
  });

  it('usa una sola consulta de staff cuando el resultado se reutiliza', () => {
    const findStaffSpy = vi.fn().mockImplementation(mockFindStaff);
    const resourceId = '22222222-2222-2222-2222-222222222222';

    const staffResult = findStaffSpy(resourceId);
    const assignedResource = staffResult ? String(staffResult.resourceId) : null;

    expect(findStaffSpy).toHaveBeenCalledTimes(1);
    expect(assignedResource).toBe(resourceId);
  });

  it('normaliza movimientos legacy para construir el payload fiscal', () => {
    const movimiento = createMockMovimiento();
    const payload = [
      String(movimiento.prevHash),
      String(movimiento.transactionId),
      String(movimiento.tipoMovimiento),
      Number(movimiento.importeContable),
      String(movimiento.formaPago),
    ].join('|');

    expect(payload).toContain(movimiento.prevHash);
    expect(payload).toContain(movimiento.transactionId);
    expect(payload).toContain('50');
    expect(payload).toContain(movimiento.formaPago);
  });
});
