#!/usr/bin/env python3
content = '''
describe('mmSecrets.js - Integridad', () => {
  it('SECRETS frozen', () => {
    expect(Object.isFrozen(SECRETS)).toBe(true);
  });
  it('sin espacios', () => {
    for (const v of Object.values(SECRETS)) {
      expect(v).toBe(v.trim());
      expect(v).not.toMatch(/\\s/);
    }
  });
  it('UPPER_SNAKE_CASE', () => {
    for (const v of Object.values(SECRETS)) {
      expect(v).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });
  it('secretos criticos', () => {
    expect(SECRETS.FISCAL_KEY).toBe('SECRETOFISCALKEY');
    expect(SECRETS.AUTH_JWT_KEY).toBe('SECRETO_AUTH_JWT_KEY');
    expect(SECRETS.M365_WEBHOOK_HMAC_KEY).toBe('SECRETO_M365_WEBHOOK_HMAC_KEY');
  });
  it('19 secretos', () => {
    expect(Object.keys(SECRETS)).toHaveLength(19);
  });
  it('sin vacios', () => {
    for (const v of Object.values(SECRETS)) {
      expect(v).not.toBe('');
    }
  });
});

describe('data.js - Protecciones', () => {
  it('MovimientosCaja update viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.MovimientosCaja_beforeUpdate({} as any)).toThrow('FISCAL_VIOLATION');
  });
  it('MovimientosCaja remove viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.MovimientosCaja_beforeRemove({} as any)).toThrow('FISCAL_VIOLATION');
  });
  it('HistoricoCierresZ update viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.HistoricoCierresZ_beforeUpdate({} as any)).toThrow('FISCAL_VIOLATION');
  });
  it('HistoricoCierresZ remove viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.HistoricoCierresZ_beforeRemove({} as any)).toThrow('FISCAL_VIOLATION');
  });
  it('RegistrosHorarios update viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.RegistrosHorariosStaff_beforeUpdate({} as any)).toThrow('LABOR_LOG_VIOLATION');
  });
  it('RegistrosHorarios remove viola', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.RegistrosHorariosStaff_beforeRemove({} as any)).toThrow('LABOR_LOG_VIOLATION');
  });
  it('CajaActual remove protegido', async () => {
    const m = await import('../src/backend/data.js');
    expect(() => m.CajaActual_beforeRemove({} as any)).toThrow('SINGLETON_PROTECTED');
  });
  it('sin hooks legacy', async () => {
    const m = await import('../src/backend/data.js');
    expect((m as any).MOVIMIENTOS_CAJA_beforeInsert).toBeUndefined();
    expect((m as any).CIERRES_Z_beforeUpdate).toBeUndefined();
  });
});
'''
with open('/workspaces/marianmadrid5000/tests/static-contracts.test.ts', 'a') as f:
    f.write(content)
print('Part 3a done')
