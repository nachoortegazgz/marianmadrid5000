// tests/bookingCore.test.ts — Tests unitarios para bookingCore.js (versión JS real)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as bookingCore from '../src/backend/booking/bookingCore';
import type { CertifiedSlot } from '../src/backend/booking/types/booking.types';

const { 
  isValidGuid,
  _extractResourceIdsFromSlot,
  _generateSlotKey,
  _projectCertifiedSlot,
  _forceStaffInPristineSlot,
  _persistBooking,
  _generatePairToken,
  _areSlotsCompatible,
  _auditBookingPrice,
  _areSlotsContiguous
} = bookingCore;

describe('bookingCore.ts', () => {
  describe('isValidGuid', () => {
    it('debe retornar true para GUIDs válidos', () => {
      expect(isValidGuid('11111111-1111-4111-8111-111111111111')).toBe(true);
      expect(isValidGuid('aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee')).toBe(true);
    });

    it('debe retornar false para GUIDs inválidos', () => {
      expect(isValidGuid('invalid-id')).toBe(false);
      expect(isValidGuid('')).toBe(false);
      expect(isValidGuid(null)).toBe(false);
      expect(isValidGuid(undefined)).toBe(false);
      expect(isValidGuid('12345')).toBe(false);
    });
  });

  describe('_extractResourceIdsFromSlot', () => {
    it('debe extraer resourceId simple', () => {
      const slot = { resourceId: '11111111-1111-4111-8111-111111111111' };
      expect(_extractResourceIdsFromSlot(slot)).toEqual(['11111111-1111-4111-8111-111111111111']);
    });

    it('debe extraer múltiples recursos de array', () => {
      const slot = {
        resources: [
          { id: '11111111-1111-4111-8111-111111111111', name: 'Staff 1' },
          { id: '22222222-2222-4222-8222-222222222222', name: 'Staff 2' }
        ]
      };
      expect(_extractResourceIdsFromSlot(slot)).toEqual([
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222'
      ]);
    });

    it('debe deduplicar recursos', () => {
      const slot = {
        resourceId: '11111111-1111-4111-8111-111111111111',
        resources: [{ id: '11111111-1111-4111-8111-111111111111' }],
        staffMemberId: '11111111-1111-4111-8111-111111111111'
      };
      expect(_extractResourceIdsFromSlot(slot)).toEqual(['11111111-1111-4111-8111-111111111111']);
    });

    it('debe retornar array vacío para slot inválido', () => {
      expect(_extractResourceIdsFromSlot(null)).toEqual([]);
      expect(_extractResourceIdsFromSlot({})).toEqual([]);
    });
  });

  describe('_generateSlotKey', () => {
    it('debe generar clave única para slot válido', () => {
      const slot = {
        primaryServiceGuid: 'srv-1',
        scheduleId: 'sch-1',
        localStartDate: '2026-09-02T10:00:00',
        resourceId: 'res-1'
      };
      const key = _generateSlotKey(slot);
      expect(key).toBe('srv-1|sch-1|2026-09-02T10:00:00|res-1');
    });

    it('debe retornar null si faltan campos requeridos', () => {
      const slot = { primaryServiceGuid: 'srv-1' };
      expect(_generateSlotKey(slot)).toBeNull();
    });
  });

  describe('_projectCertifiedSlot', () => {
    it('debe proyectar slot válido a formato certificado', () => {
      const slot = {
        primaryServiceGuid: '11111111-1111-4111-8111-111111111111',
        scheduleId: '22222222-2222-4222-8222-222222222222',
        localStartDate: '2026-09-02T10:00:00',
        localEndDate: '2026-09-02T10:30:00',
        resourceId: '33333333-3333-4333-8333-333333333333',
        resourceName: 'María García'
      };
      
      const result = _projectCertifiedSlot(slot);
      
      expect(result).toMatchObject({
        serviceId: '11111111-1111-4111-8111-111111111111',
        scheduleId: '22222222-2222-4222-8222-222222222222',
        resource: {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'María García'
        },
        localStartDate: '2026-09-02T10:00:00',
        localEndDate: '2026-09-02T10:30:00'
      });
    });

    it('debe retornar null si falta primaryServiceGuid', () => {
      const slot = { resourceId: 'res-1' };
      expect(_projectCertifiedSlot(slot)).toBeNull();
    });

    it('debe retornar null si resourceId no es GUID válido', () => {
      const slot = {
        primaryServiceGuid: 'srv-1',
        resourceId: 'invalid-id'
      };
      expect(_projectCertifiedSlot(slot)).toBeNull();
    });

    it('debe retornar null si fechas son inválidas', () => {
      const slot = {
        primaryServiceGuid: 'srv-1',
        resourceId: '33333333-3333-4333-8333-333333333333',
        localStartDate: 'fecha-invalida',
        localEndDate: 'tambien-invalida'
      };
      expect(_projectCertifiedSlot(slot)).toBeNull();
    });
  });

  describe('_forceStaffInPristineSlot', () => {
    it('debe retornar null si falta primaryServiceGuid', async () => {
      const slot = { resourceId: 'abc', scheduleId: 'def' };
      const result = await _forceStaffInPristineSlot(slot, 'res-1', null, 30);
      expect(result).toBeNull();
    });

    it('debe retornar null si el resourceId no es GUID válido', async () => {
      const slot = { primaryServiceGuid: 'srv-1' };
      const result = await _forceStaffInPristineSlot(slot, 'invalid-id', 'srv-1', 30);
      expect(result).toBeNull();
    });

    it('debe retornar null si falta localStartDate', async () => {
      const slot = { primaryServiceGuid: 'srv-1' };
      const result = await _forceStaffInPristineSlot(
        slot, 
        '33333333-3333-4333-8333-333333333333', 
        'srv-1', 
        30
      );
      expect(result).toBeNull();
    });

    it('debe retornar null si localStartDate es fecha inválida', async () => {
      const slot = { 
        primaryServiceGuid: 'srv-1',
        localStartDate: 'not-a-date'
      };
      const result = await _forceStaffInPristineSlot(
        slot, 
        '33333333-3333-4333-8333-333333333333', 
        'srv-1', 
        30
      );
      expect(result).toBeNull();
    });

    it('debe proyectar slot con shape correcto cuando es válido', async () => {
      const slot = {
        primaryServiceGuid: '11111111-1111-4111-8111-111111111111',
        scheduleId: '22222222-2222-4222-8222-222222222222',
        localStartDate: '2026-09-02T10:00:00',
      };
      
      const result = await _forceStaffInPristineSlot(
        slot,
        '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        30
      );
      
      expect(result).toMatchObject({
        serviceId: '11111111-1111-4111-8111-111111111111',
        scheduleId: '22222222-2222-4222-8222-222222222222',
        resource: { id: '33333333-3333-4333-8333-333333333333' },
        localStartDate: '2026-09-02T10:00:00'
      });
      
      // Verificar que calculó localEndDate
      expect(result?.localEndDate).toBeDefined();
    });
  });

  describe('_persistBooking', () => {
    it('debe lanzar error si faltan campos requeridos', async () => {
      const params: any = { bookingId: '' };
      
      await expect(_persistBooking(params as any, 'trace-1'))
        .rejects.toThrow('Missing required fields');
    });

    it('debe lanzar error si primaryServiceGuid no es GUID válido', async () => {
      const params: any = {
        bookingId: 'book-1',
        primaryServiceGuid: 'invalid-guid',
        scheduleId: 'sch-1'
      };
      
      await expect(_persistBooking(params, 'trace-1'))
        .rejects.toThrow('Invalid primaryServiceGuid');
    });

    it('debe lanzar error si tipo de booking es inválido', async () => {
      const params: any = {
        bookingId: 'book-1',
        primaryServiceGuid: '11111111-1111-4111-8111-111111111111',
        scheduleId: 'sch-1',
        startDate: new Date(),
        endDate: new Date(),
        tipo: 'tipo_invalido',
        meta: { estadoPago: 'UNPAID' }
      };
      
      await expect(_persistBooking(params, 'trace-1'))
        .rejects.toThrow('Invalid booking type');
    });

    it('debe lanzar error si estado de pago es inválido', async () => {
      const params: any = {
        bookingId: 'book-1',
        primaryServiceGuid: '11111111-1111-4111-8111-111111111111',
        scheduleId: 'sch-1',
        startDate: new Date(),
        endDate: new Date(),
        tipo: 'simple',
        meta: { estadoPago: 'INVALID_STATE' }
      };
      
      await expect(_persistBooking(params, 'trace-1'))
        .rejects.toThrow('Invalid payment state');
    });

    it('debe persistir booking correctamente con datos válidos', async () => {
      const params = {
        bookingId: 'book-123',
        revision: 1,
        primaryServiceGuid: '11111111-1111-4111-8111-111111111111',
        scheduleId: '22222222-2222-4222-8222-222222222222',
        resourceId: '33333333-3333-4333-8333-333333333333',
        startDate: new Date('2026-09-02T10:00:00'),
        endDate: new Date('2026-09-02T10:30:00'),
        contactDetails: { firstName: 'Juan', email: 'juan@test.com' },
        tipo: 'simple' as const,
        meta: {
          pairToken: 'pair-1',
          uiPairToken: 'ui-1',
          addons: [],
          addonsTotal: 0,
          resourceId: null,
          resourceFilterId: null,
          resourceFilterName: '',
          primaryServiceId: '11111111-1111-4111-8111-111111111111',
          secondaryServiceId: null,
          traceId: 'trace-1',
          esCombinado: false,
          fechaYmdMadrid: '2026-09-02',
          servicioNombre: 'Servicio Test',
          estadoPago: 'UNPAID' as const,
          metodoPago: 'ONLINE' as const,
          precioAuditado: 100
        }
      };
      
      const result = await _persistBooking(params, 'trace-1');
      
      expect(result.created).toBe(true);
      expect(result.item._id).toBe('book-123');
      expect(result.item.tipo).toBe('simple');
    });
  });

  describe('_generatePairToken', () => {
    it('debe generar token único con traceId', () => {
      const token1 = _generatePairToken('trace-1');
      const token2 = _generatePairToken('trace-1');
      
      expect(token1).toMatch(/^pair_trace-1_/);
      expect(token2).toMatch(/^pair_trace-1_/);
      expect(token1).not.toBe(token2); // Deben ser únicos
    });
  });

  describe('_areSlotsCompatible', () => {
    const baseSlot: CertifiedSlot = {
      serviceId: 'srv-1',
      scheduleId: 'sch-1',
      resource: { id: 'res-1' },
      localStartDate: '2026-09-02T10:00:00',
      localEndDate: '2026-09-02T10:30:00'
    };

    it('debe retornar false si los recursos son diferentes', () => {
      const slot2: CertifiedSlot = {
        ...baseSlot,
        resource: { id: 'res-2' },
        localStartDate: '2026-09-02T10:30:00',
        localEndDate: '2026-09-02T11:00:00'
      };
      
      expect(_areSlotsCompatible(baseSlot, slot2)).toBe(false);
    });

    it('debe retornar true si slots son consecutivos en mismo recurso', () => {
      const slot2: CertifiedSlot = {
        ...baseSlot,
        localStartDate: '2026-09-02T10:30:00',
        localEndDate: '2026-09-02T11:00:00'
      };
      
      expect(_areSlotsCompatible(baseSlot, slot2)).toBe(true);
    });

    it('debe retornar true si hay gap menor a maxGapMinutes', () => {
      const slot2: CertifiedSlot = {
        ...baseSlot,
        localStartDate: '2026-09-02T10:40:00', // 10 min de gap
        localEndDate: '2026-09-02T11:10:00'
      };
      
      expect(_areSlotsCompatible(baseSlot, slot2, 15)).toBe(true);
    });

    it('debe retornar false si gap excede maxGapMinutes', () => {
      const slot2: CertifiedSlot = {
        ...baseSlot,
        localStartDate: '2026-09-02T11:00:00', // 30 min de gap
        localEndDate: '2026-09-02T11:30:00'
      };
      
      expect(_areSlotsCompatible(baseSlot, slot2, 15)).toBe(false);
    });
  });

  describe('_auditBookingPrice', () => {
    it('debe calcular precio total con addons', () => {
      const basePrice = 100;
      const addons = [
        { price: 20, quantity: 2 },
        { price: 15 }
      ];
      
      const total = _auditBookingPrice(basePrice, addons);
      expect(total).toBe(155); // 100 + 40 + 15
    });

    it('debe redondear a 2 decimales', () => {
      const basePrice = 100.333;
      const addons = [{ price: 0.111 }];
      
      const total = _auditBookingPrice(basePrice, addons);
      expect(total).toBe(100.44);
    });

    it('debe lanzar error si precio total es negativo', () => {
      const basePrice = -100;
      
      expect(() => _auditBookingPrice(basePrice, [])).toThrow('Precio auditado inválido');
    });
  });
});
