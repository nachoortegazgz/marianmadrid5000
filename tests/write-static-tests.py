#!/usr/bin/env python3
import os
content = '''/**
 * tests/static-contracts.test.ts
 */
import { describe, it, expect } from 'vitest';
import { COLLECTIONS, SDK_CONFIG, SERVICE_CATALOG, TIPO_FICHAJE, TIPO_MOVIMIENTO, ESTADO_CITA, ESTADO_PAGO, CITA_FIELDS, STAFF_ACCESS, IVA_RATES, CAJA_STATUS, SINGLETONS, CONCURRENCY, SLOT_SEARCH, API, JWT, COLLAB_ROLES } from '../src/backend/internalConfig.js';
import { SECRETS } from '../src/backend/mmSecrets.js';
import { _safeTrim, _roundMoney, _isValidEmail, _maskEmail, _maskPhone, _maskName, _maskIp, _readDate, _readPositiveAmount, _readNonNegativeAmount, _cleanText, _stableSerialize, _looksLikeGuid, _generateUUID, _hashKey, _normalizeIdPart, _cloneDeep, _extractRelationalId } from '../src/public/mmUtils.js';
import cmsContract from './cms-contract.json' assert { type: 'json' };

describe('SSOT Inmutabilidad', () => {
  it('COLLECTIONS frozen', () => {
    expect(Object.isFrozen(COLLECTIONS)).toBe(true);
    expect(() => { (COLLECTIONS as any).X = 'Y'; }).toThrow();
  });
  it('SDK_CONFIG frozen', () => {
    expect(Object.isFrozen(SDK_CONFIG)).toBe(true);
    expect(Object.isFrozen(SDK_CONFIG.TIMEOUTS)).toBe(true);
    expect(Object.isFrozen(SDK_CONFIG.CACHE)).toBe(true);
  });
  it('SERVICE_CATALOG correcto', () => {
    expect(SERVICE_CATALOG.CURRENCY).toBe('EUR');
    expect(SERVICE_CATALOG.MAX_TITLE_LENGTH).toBe(160);
    expect(SERVICE_CATALOG.MAX_DURATION_MINUTES).toBe(1440);
  });
  it('TIPO_FICHAJE 5 tipos', () => {
    expect(Object.values(TIPO_FICHAJE)).toHaveLength(5);
    expect((TIPO_FICHAJE as any).ENTRADA_MANUAL).toBeUndefined();
  });
  it('TIPO_MOVIMIENTO 7 tipos', () => {
    expect(Object.values(TIPO_MOVIMIENTO)).toHaveLength(7);
  });
  it('paymentStatus canonico', () => {
    expect(CITA_FIELDS.STATUS_PAGO).toBe('paymentStatus');
    expect((CITA_FIELDS as any).statusPago).toBeUndefined();
  });
  it('STAFF_ACCESS 3 roles', () => {
    expect(STAFF_ACCESS.ALLOWED_ROLES).toEqual(['ADMIN', 'GESTION', 'ESTILISTA']);
  });
  it('IVA_RATES 4 tasas', () => {
    expect(IVA_RATES.GENERAL).toBe(0.21);
    expect(IVA_RATES.REDUCIDO).toBe(0.10);
    expect(IVA_RATES.SUPERREDUCIDO).toBe(0.04);
    expect(IVA_RATES.EXENTO).toBe(0.0);
  });
  it('SLOT_SEARCH 14 dias', () => {
    expect(SLOT_SEARCH.DIAS_LIMITE).toBe(14);
  });
  it('API IDs', () => {
    expect(API.STAFF_RESOURCE_TYPE_ID).toBe('1cd44cf8-756f-41c3-bd90-3e2ffcaf1155');
  });
  it('JWT config', () => {
    expect(JWT.ALGORITHM).toBe('HS256');
    expect(JWT.EXPIRATION_MS).toBe(1800000);
  });
});

describe('Consistencia cms-contract', () => {
  it('internalConfig en cms-contract', () => {
    for (const [k, v] of Object.entries(COLLECTIONS)) {
      expect(cmsContract.collections[k]).toBe(v);
    }
  });
  it('cms-contract en internalConfig', () => {
    for (const [k, v] of Object.entries(cmsContract.collections)) {
      expect((COLLECTIONS as any)[k]).toBe(v);
    }
  });
  it('31 colecciones', () => {
    expect(Object.keys(COLLECTIONS)).toHaveLength(31);
  });
  it('no COMPLEMENTOS_CATALOGO', () => {
    expect((COLLECTIONS as any).COMPLEMENTOS_CATALOGO).toBeUndefined();
  });
  it('PascalCase IDs', () => {
    for (const v of Object.values(COLLECTIONS)) {
      expect(v).toMatch(/^[A-Z][a-zA-Z0-9]+$/);
    }
  });
});
'''
with open('/workspaces/marianmadrid5000/tests/static-contracts.test.ts', 'w') as f:
    f.write(content)
print('Part 1 done')
