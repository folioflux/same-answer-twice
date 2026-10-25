import { describe, expect, it } from 'vitest';
import { formatPath, matchesPattern, parsePathPattern } from '../src/paths.js';

describe('paths', () => {
  it('formats paths', () => {
    expect(formatPath([])).toBe('$');
    expect(formatPath(['rows', 0, 'amount'])).toBe('$.rows[0].amount');
    expect(formatPath(['odd key', 'a-b'])).toBe('$["odd key"]["a-b"]');
  });

  it('parses patterns', () => {
    expect(parsePathPattern('$')).toEqual([]);
    expect(parsePathPattern('$.rows[*].id')).toEqual([
      { kind: 'key', value: 'rows' },
      { kind: 'wildcard' },
      { kind: 'key', value: 'id' },
    ]);
    expect(parsePathPattern('meta.*')).toEqual([
      { kind: 'key', value: 'meta' },
      { kind: 'wildcard' },
    ]);
    expect(parsePathPattern('$["a.b"][2]')).toEqual([
      { kind: 'key', value: 'a.b' },
      { kind: 'index', value: 2 },
    ]);
  });

  it('round-trips formatted paths', () => {
    const segments = ['a', 'odd key', 3, 'z'];
    expect(matchesPattern(segments, parsePathPattern(formatPath(segments)))).toBe(true);
  });

  it('matches only paths of the same length', () => {
    const pattern = parsePathPattern('$.rows[*]');
    expect(matchesPattern(['rows', 4], pattern)).toBe(true);
    expect(matchesPattern(['rows', 4, 'id'], pattern)).toBe(false);
    expect(matchesPattern(['other', 4], pattern)).toBe(false);
  });

  it.each(['', '$.', '$..a', '$[', '$[foo]', '$x', '$["unterminated]'])(
    'rejects invalid pattern %j',
    (pattern) => {
      expect(() => parsePathPattern(pattern)).toThrow(SyntaxError);
    },
  );
});
