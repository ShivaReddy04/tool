import { validateSchemaName, validateIdentifier, validateColumnDefault } from './validation';

describe('validateSchemaName', () => {
  it('accepts a standard identifier', () => {
    expect(validateSchemaName('public')).toEqual({ valid: true, sanitized: 'public' });
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateSchemaName('  staging  ')).toEqual({ valid: true, sanitized: 'staging' });
  });

  it('rejects non-string input', () => {
    expect(validateSchemaName(undefined).valid).toBe(false);
    expect(validateSchemaName(123 as any).valid).toBe(false);
  });

  it('rejects empty / whitespace-only input', () => {
    expect(validateSchemaName('').valid).toBe(false);
    expect(validateSchemaName('   ').valid).toBe(false);
  });

  it('rejects names starting with a digit', () => {
    expect(validateSchemaName('1abc').valid).toBe(false);
  });

  it('rejects names containing punctuation / SQL metacharacters', () => {
    expect(validateSchemaName('foo bar').valid).toBe(false);
    expect(validateSchemaName('foo-bar').valid).toBe(false);
    expect(validateSchemaName('foo"; DROP TABLE x; --').valid).toBe(false);
    expect(validateSchemaName('foo;bar').valid).toBe(false);
  });

  it('rejects names longer than 100 characters', () => {
    expect(validateSchemaName('a'.repeat(101)).valid).toBe(false);
    expect(validateSchemaName('a'.repeat(100)).valid).toBe(true);
  });

  it('accepts underscore-led names', () => {
    expect(validateSchemaName('_internal').valid).toBe(true);
  });
});

describe('validateIdentifier', () => {
  it('uses the provided label in error messages', () => {
    const res = validateIdentifier('1bad', 'Column #2 name');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Column #2 name');
  });

  it('allows up to 255 chars (vs 100 for schema)', () => {
    expect(validateIdentifier('a'.repeat(255)).valid).toBe(true);
    expect(validateIdentifier('a'.repeat(256)).valid).toBe(false);
  });
});

describe('validateColumnDefault', () => {
  it('treats empty / missing input as "no default"', () => {
    expect(validateColumnDefault('', 'INTEGER')).toEqual({ valid: true, sanitized: '' });
    expect(validateColumnDefault('   ', 'INTEGER')).toEqual({ valid: true, sanitized: '' });
    expect(validateColumnDefault(undefined, 'INTEGER').valid).toBe(true);
  });

  it('lets SQL keywords pass for any type (NOW(), CURRENT_DATE, etc.)', () => {
    expect(validateColumnDefault('CURRENT_DATE', 'DATE').valid).toBe(true);
    expect(validateColumnDefault('NOW()', 'TIMESTAMP').valid).toBe(true);
    expect(validateColumnDefault('NULL', 'VARCHAR(50)').valid).toBe(true);
    expect(validateColumnDefault('current_timestamp', 'TIMESTAMP').valid).toBe(true);
  });

  describe('DATE / TIMESTAMP', () => {
    it('rejects unquoted identifiers (the original "DEFAULT AI" bug)', () => {
      const res = validateColumnDefault('AI', 'DATE');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/quoted date/i);
    });

    it('rejects quoted strings that are not parseable dates', () => {
      expect(validateColumnDefault("'tomorrow-ish'", 'DATE').valid).toBe(false);
    });

    it('accepts quoted ISO dates', () => {
      expect(validateColumnDefault("'2026-01-01'", 'DATE').valid).toBe(true);
      expect(validateColumnDefault("'2026-01-01 12:00:00'", 'TIMESTAMP').valid).toBe(true);
    });
  });

  describe('BOOLEAN', () => {
    it('accepts TRUE/FALSE/0/1 in any case', () => {
      expect(validateColumnDefault('TRUE', 'BOOLEAN').valid).toBe(true);
      expect(validateColumnDefault('false', 'BOOLEAN').valid).toBe(true);
      expect(validateColumnDefault('0', 'BOOL').valid).toBe(true);
      expect(validateColumnDefault('1', 'BOOL').valid).toBe(true);
    });

    it('rejects anything else', () => {
      expect(validateColumnDefault('YES', 'BOOLEAN').valid).toBe(false);
      expect(validateColumnDefault("'true'", 'BOOLEAN').valid).toBe(false);
    });
  });

  describe('numeric types', () => {
    it('accepts integers and decimals (positive and negative)', () => {
      expect(validateColumnDefault('0', 'INTEGER').valid).toBe(true);
      expect(validateColumnDefault('-1.5', 'NUMERIC').valid).toBe(true);
      expect(validateColumnDefault('42', 'BIGINT').valid).toBe(true);
    });

    it('rejects quoted strings and identifiers', () => {
      expect(validateColumnDefault("'0'", 'INTEGER').valid).toBe(false);
      expect(validateColumnDefault('zero', 'INTEGER').valid).toBe(false);
    });

    it('strips parenthesized precision before checking the base type', () => {
      expect(validateColumnDefault('1.23', 'NUMERIC(10,2)').valid).toBe(true);
    });
  });

  describe('text types', () => {
    it('requires quoting (prevents unquoted identifier → column reference)', () => {
      const res = validateColumnDefault('unknown', 'VARCHAR(50)');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/quoted string/i);
    });

    it('accepts single-quoted literals', () => {
      expect(validateColumnDefault("'hello'", 'VARCHAR(50)').valid).toBe(true);
      expect(validateColumnDefault("'x'", 'TEXT').valid).toBe(true);
      expect(validateColumnDefault("'y'", 'CHARACTER VARYING').valid).toBe(true);
    });
  });

  describe('unknown / dialect-specific types', () => {
    it('passes through (JSONB, SUPER, etc. — too many shapes to predict)', () => {
      expect(validateColumnDefault("'{}'::jsonb", 'JSONB').valid).toBe(true);
      expect(validateColumnDefault('something', 'SUPER').valid).toBe(true);
    });
  });
});
