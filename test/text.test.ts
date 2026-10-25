import { describe, expect, it } from 'vitest';
import { extractNumbers, normalizeText, parseAnswer } from '../src/index.js';

describe('extractNumbers', () => {
  it.each([
    ['Total income was 1,234.50 and expenses were 980.', [1234.5, 980]],
    ['Net: -45.10 (down 12.5%)', [-45.1, 12.5]],
    ['Balance $1,200 on 2026-01-31', [1200, 2026, 1, 31]],
    ['Unicode minus −7 and plus +3', [-7, 3]],
    ['Half is .5', [0.5]],
    ['abc123 is an id, not a number', []],
    ['1,2345 is not a grouped number', [1, 2345]],
    ['-0 is zero', [0]],
    ['No numbers here.', []],
  ])('%j', (text, expected) => {
    expect(extractNumbers(text)).toEqual(expected);
  });
});

describe('normalizeText', () => {
  it('trims, collapses whitespace and normalizes line endings', () => {
    expect(normalizeText('  a\r\n\r\n b\tc  ')).toBe('a b c');
  });

  it('normalizes Unicode to NFC', () => {
    expect(normalizeText('cafe\u0301')).toBe('caf\u00e9');
  });
});

describe('parseAnswer', () => {
  it('parses JSON and strips a byte order mark', () => {
    expect(parseAnswer('\uFEFF{"a":1}', 'json')).toEqual({ a: 1 });
  });

  it('throws a readable error for invalid JSON', () => {
    expect(() => parseAnswer('not json', 'json')).toThrow(/Output is not valid JSON/);
  });

  it('supports text and numbers modes', () => {
    expect(parseAnswer(' Total:  10 \n', 'text')).toBe('Total: 10');
    expect(parseAnswer('Total: 10, fees 2.5', 'numbers')).toEqual([10, 2.5]);
  });
});
