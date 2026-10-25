import { describe, expect, it } from 'vitest';
import { canonicalize, normalize, roundTo } from '../src/index.js';

describe('normalize', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('gives the same canonical form regardless of key order', () => {
    expect(canonicalize({ x: 1, y: [1, 2] })).toBe(canonicalize({ y: [1, 2], x: 1 }));
  });

  it('drops undefined, functions and symbols in objects like JSON does', () => {
    expect(normalize({ a: undefined, b: () => 1, c: Symbol('s'), d: 1 })).toEqual({ d: 1 });
  });

  it('turns unrepresentable array items into null', () => {
    expect(normalize([undefined, () => 1, 2])).toEqual([null, null, 2]);
  });

  it('turns -0 into 0 and marks non-finite numbers', () => {
    expect(normalize([-0, NaN, Infinity, -Infinity])).toEqual([
      0,
      { $number: 'NaN' },
      { $number: 'Infinity' },
      { $number: '-Infinity' },
    ]);
  });

  it('handles bigint, Date, Map and Set', () => {
    expect(
      normalize({
        big: 10n,
        when: new Date('2026-01-31T00:00:00.000Z'),
        map: new Map([['k', 1]]),
        set: new Set([3, 1]),
      }),
    ).toEqual({
      big: { $bigint: '10' },
      map: { k: 1 },
      set: [3, 1],
      when: '2026-01-31T00:00:00.000Z',
    });
  });

  it('rounds numbers when precision is set', () => {
    expect(normalize({ a: 1.005, b: 2.344, c: -2.345 }, { precision: 2 })).toEqual({
      a: 1.01,
      b: 2.34,
      c: -2.35,
    });
  });

  it('normalizes strings on request', () => {
    expect(normalize('  Hello \n  World ', { normalizeWhitespace: true, ignoreCase: true })).toBe(
      'hello world',
    );
    expect(normalize('  Hello ')).toBe('  Hello ');
  });

  it('sorts arrays when ignoreArrayOrder is set', () => {
    expect(canonicalize([3, 1, 2], { ignoreArrayOrder: true })).toBe('[1,2,3]');
    expect(canonicalize([{ id: 'b' }, { id: 'a' }], { ignoreArrayOrder: true })).toBe(
      canonicalize([{ id: 'a' }, { id: 'b' }], { ignoreArrayOrder: true }),
    );
  });

  it('removes ignored paths, including wildcards', () => {
    const value = {
      meta: { runId: 'x', at: 't' },
      rows: [
        { id: 1, v: 2 },
        { id: 2, v: 3 },
      ],
    };
    expect(normalize(value, { ignorePaths: ['$.meta.runId', '$.rows[*].id'] })).toEqual({
      meta: { at: 't' },
      rows: [{ v: 2 }, { v: 3 }],
    });
    expect(normalize(value, { ignorePaths: ['meta'] })).toEqual({
      rows: [
        { id: 1, v: 2 },
        { id: 2, v: 3 },
      ],
    });
  });

  it('rejects circular references', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => normalize(a)).toThrow(/circular reference at \$\.self/);
  });

  it('allows the same object to appear twice when it is not circular', () => {
    const shared = { v: 1 };
    expect(normalize([shared, shared])).toEqual([{ v: 1 }, { v: 1 }]);
  });

  it('validates precision', () => {
    expect(() => normalize(1, { precision: -1 })).toThrow(RangeError);
    expect(() => normalize(1, { precision: 1.5 })).toThrow(RangeError);
  });
});

describe('roundTo', () => {
  it.each([
    [1.005, 2, 1.01],
    [1.0049, 2, 1],
    [-1.005, 2, -1.01],
    [0.1 + 0.2, 2, 0.3],
    [123456.785, 2, 123456.79],
    [2.5, 0, 3],
    [-2.5, 0, -3],
    [-0.001, 2, 0],
    [1e-7, 2, 0],
    [1e21, 2, 1e21],
  ])('roundTo(%d, %d) = %d', (value, decimals, expected) => {
    expect(roundTo(value, decimals)).toBe(expected);
  });
});
