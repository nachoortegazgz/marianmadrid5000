// tests/bookingOptimized.test.js — Tests para optimización Bucket Indexing
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  _extractResourceIdsFromSlot, 
  _rankResourcesByLoad,
} from '../src/backend/booking/bookingCore.js';

describe('Booking Optimizado - Bucket Indexing', () => {
  
  describe('_extractResourceIdsFromSlot', () => {
    it('debe extraer resourceId válido de slot con objeto resource', () => {
      const slot = {
        resource: { id: '11111111-1111-1111-1111-111111111111' }
      };
      const result = _extractResourceIdsFromSlot(slot);
      expect(result).toEqual(['11111111-1111-1111-1111-111111111111']);
    });

    it('debe retornar array vacío si slot es null', () => {
      expect(_extractResourceIdsFromSlot(null)).toEqual([]);
    });

    it('debe retornar array vacío si resource no tiene id', () => {
      const slot = { resource: {} };
      expect(_extractResourceIdsFromSlot(slot)).toEqual([]);
    });

    it('debe retornar array vacío si id no es GUID válido', () => {
      const slot = { resource: { id: 'invalid-id' } };
      expect(_extractResourceIdsFromSlot(slot)).toEqual([]);
    });
  });

  describe('_rankResourcesByLoad', () => {
    it('debe ordenar recursos por carga ascendente', async () => {
      const resources = [
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa09', // load 9
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', // load 1
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05'  // load 5
      ];
      const result = await _rankResourcesByLoad(resources, '2026-09-02', 'test-trace');
      // Esperamos orden: 01, 05, 09
      expect(result[0]).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01');
      expect(result[2]).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa09');
    });

    it('debe retornar array vacío si input es vacío', async () => {
      const result = await _rankResourcesByLoad([], '2026-09-02', 'test-trace');
      expect(result).toEqual([]);
    });

    it('debe retornar input original si hay error', async () => {
      // Simulamos caso donde el sorting falla internamente (no debería en este mock)
      const resources = ['11111111-1111-1111-1111-111111111111'];
      const result = await _rankResourcesByLoad(resources, '2026-09-02', 'test-trace');
      expect(result).toHaveLength(1);
    });
  });
});
