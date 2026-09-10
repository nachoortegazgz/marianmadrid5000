#!/usr/bin/env python3
content = '''describe('mmUtils - _roundMoney', () => {
  it('resuelve 0.1 + 0.2', () => {
    expect(_roundMoney(0.1 + 0.2)).toBe(0.3);
  });
  it('redondeo half-up', () => {
    expect(_roundMoney(1.005)).toBe(1.01);
    expect(_roundMoney(1.004)).toBe(1);
  });
  it('no finitos retornan 0', () => {
    expect(_roundMoney(NaN)).toBe(0);
    expect(_roundMoney(Infinity)).toBe(0);
    expect(_roundMoney(-Infinity)).toBe(0);
  });
  it('negativos', () => {
    expect(_roundMoney(-10.555)).toBe(-10.56);
  });
});

describe('mmUtils - _isValidEmail', () => {
  it('validos', () => {
    expect(_isValidEmail('<EMAIL>')).toBe(true);
    expect(_isValidEmail('<EMAIL>')).toBe(true);
    expect(_isValidEmail('a@b.co')).toBe(true);
  });
  it('invalidos', () => {
    expect(_isValidEmail('')).toBe(false);
    expect(_isValidEmail('notanemail')).toBe(false);
    expect(_isValidEmail('@nodomain')).toBe(false);
    expect(_isValidEmail('no@tld')).toBe(false);
    expect(_isValidEmail('spaces in@email.com')).toBe(false);
  });
  it('null/undefined', () => {
    expect(_isValidEmail(null as any)).toBe(false);
    expect(_isValidEmail(undefined as any)).toBe(false);
  });
});

describe('mmUtils - _maskEmail', () => {
  it('enmascara', () => {
    expect(_maskEmail('<EMAIL>')).toBe('jo***@do***.com');
    expect(_maskEmail('<EMAIL>')).toBe('t***@do***.com');
  });
  it('invalidos retornan ***', () => {
    expect(_maskEmail('')).toBe('***');
    expect(_maskEmail('notanemail')).toBe('***');
  });
  it('nunca expone completo', () => {
    const m = _maskEmail('<EMAIL>');
    expect(m).not.toContain('john');
    expect(m).toContain('***');
  });
});

describe('mmUtils - _readDate', () => {
  it('validas', () => {
    expect(_readDate('2026-01-01')).toBe('2026-01-01');
    expect(_readDate('2024-02-29')).toBe('2024-02-29');
  });
  it('invalidas', () => {
    expect(_readDate('2026-13-01')).toBeNull();
    expect(_readDate('2026-00-01')).toBeNull();
    expect(_readDate('2026-01-32')).toBeNull();
    expect(_readDate('2026-02-30')).toBeNull();
    expect(_readDate('2026-04-31')).toBeNull();
    expect(_readDate('2023-02-29')).toBeNull();
    expect(_readDate('not-a-date')).toBeNull();
    expect(_readDate('2026/01/01')).toBeNull();
  });
  it('null/undefined', () => {
    expect(_readDate(null as any)).toBeNull();
    expect(_readDate(undefined as any)).toBeNull();
  });
});

describe('mmUtils - _readPositiveAmount', () => {
  it('validos', () => {
    expect(_readPositiveAmount('10')).toBe(10);
    expect(_readPositiveAmount('0.01')).toBe(0.01);
  });
  it('invalidos', () => {
    expect(_readPositiveAmount('0')).toBeNull();
    expect(_readPositiveAmount('-1')).toBeNull();
    expect(_readPositiveAmount('')).toBeNull();
    expect(_readPositiveAmount(null as any)).toBeNull();
    expect(_readPositiveAmount('abc')).toBeNull();
  });
});

describe('mmUtils - _readNonNegativeAmount', () => {
  it('validos', () => {
    expect(_readNonNegativeAmount('0')).toBe(0);
    expect(_readNonNegativeAmount('10')).toBe(10);
    expect(_readNonNegativeAmount('10.7')).toBe(11);
  });
  it('invalidos', () => {
    expect(_readNonNegativeAmount('-1')).toBeNull();
    expect(_readNonNegativeAmount('')).toBeNull();
  });
});

describe('mmUtils - _cleanText', () => {
  it('limpia', () => {
    expect(_cleanText('  hello  ')).toBe('hello');
    expect(_cleanText('hello', 10)).toBe('hello');
  });
  it('excede maxLength', () => {
    expect(() => _cleanText('hello world', 5)).toThrow('TEXT_TOO_LONG');
  });
  it('null/undefined', () => {
    expect(_cleanText(null as any)).toBe('');
    expect(_cleanText(undefined as any)).toBe('');
  });
});

describe('mmUtils - _stableSerialize', () => {
  it('orden estable', () => {
    expect(_stableSerialize({ b: 2, a: 1 })).toBe(_stableSerialize({ a: 1, b: 2 }));
  });
  it('primitivos', () => {
    expect(_stableSerialize(null)).toBe('null');
    expect(_stableSerialize(42)).toBe('42');
  });
});

describe('mmUtils - _looksLikeGuid', () => {
  it('validos', () => {
    expect(_looksLikeGuid('12345678-1234-4123-9234-123456789012')).toBe(true);
  });
  it('invalidos', () => {
    expect(_looksLikeGuid('')).toBe(false);
    expect(_looksLikeGuid('not-a-guid')).toBe(false);
    expect(_looksLikeGuid('12345678-1234-1234-1234-123456789012')).toBe(false);
    expect(_looksLikeGuid(null as any)).toBe(false);
  });
});

describe('mmUtils - _generateUUID', () => {
  it('v4 validos', () => {
    for (let i = 0; i < 50; i++) {
      expect(_generateUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
  it('unicos', () => {
    const set = new Set(Array.from({ length: 500 }, () => _generateUUID()));
    expect(set.size).toBe(500);
  });
});

describe('mmUtils - _hashKey', () => {
  it('deterministico', () => {
    expect(_hashKey('test')).toBe(_hashKey('test'));
  });
  it('diferentes', () => {
    expect(_hashKey('a')).not.toBe(_hashKey('b'));
  });
  it('hex 16 chars', () => {
    expect(_hashKey('test')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('mmUtils - _cloneDeep', () => {
  it('profundo', () => {
    const o = { a: { b: 1 }, c: [1, 2] };
    const cl = _cloneDeep(o);
    expect(cl).toEqual(o);
    expect(cl).not.toBe(o);
    expect(cl.a).not.toBe(o.a);
  });
  it('primitivos', () => {
    expect(_cloneDeep(null)).toBeNull();
    expect(_cloneDeep(42)).toBe(42);
  });
});

describe('mmUtils - _extractRelationalId', () => {
  it('varios formatos', () => {
    expect(_extractRelationalId({ _id: 'a' })).toBe('a');
    expect(_extractRelationalId({ id: 'b' })).toBe('b');
    expect(_extractRelationalId('c')).toBe('c');
  });
  it('null', () => {
    expect(_extractRelationalId(null)).toBe('');
    expect(_extractRelationalId(undefined)).toBe('');
  });
});
'''
with open('/workspaces/marianmadrid5000/tests/static-contracts.test.ts', 'a') as f:
    f.write(content)
print('Part 2 done')
