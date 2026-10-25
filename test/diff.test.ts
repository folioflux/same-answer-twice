import { describe, expect, it } from 'vitest';
import { diff, isEqual, numbersMatch } from '../src/index.js';

describe('diff', () => {
  it('returns nothing for equal values', () => {
    expect(diff({ a: [1, 2], b: 'x' }, { b: 'x', a: [1, 2] })).toEqual([]);
  });

  it('reports changed numbers with a clean delta', () => {
    expect(diff({ total: 0.1 }, { total: 0.3 })).toEqual([
      { kind: 'changed', path: '$.total', left: 0.1, right: 0.3, delta: 0.2 },
    ]);
  });

  it('reports added, removed and type changes in key order', () => {
    expect(diff({ a: 1, b: 2, c: '3' }, { b: 2, c: 3, d: 4 })).toEqual([
      { kind: 'removed', path: '$.a', left: 1 },
      { kind: 'type', path: '$.c', left: '3', right: 3 },
      { kind: 'added', path: '$.d', right: 4 },
    ]);
  });

  it('compares arrays index by index', () => {
    expect(diff([1, 2, 3], [1, 5])).toEqual([
      { kind: 'changed', path: '$[1]', left: 2, right: 5, delta: 3 },
      { kind: 'removed', path: '$[2]', left: 3 },
    ]);
    expect(diff([1], [1, { x: 1 }])).toEqual([{ kind: 'added', path: '$[1]', right: { x: 1 } }]);
  });

  it('aligns arrays so one insertion or removal is reported once', () => {
    expect(diff([1, 2, 3, 4, 5], [1, 2, 4, 5])).toEqual([
      { kind: 'removed', path: '$[2]', left: 3 },
    ]);
    expect(diff(['a', 'b'], ['x', 'a', 'b'])).toEqual([
      { kind: 'added', path: '$[0]', right: 'x' },
    ]);
    expect(diff([{ id: 1 }, { id: 2 }], [{ id: 2 }])).toEqual([
      { kind: 'removed', path: '$[0]', left: { id: 1 } },
    ]);
  });

  it('pairs up unaligned array items and applies tolerances to them', () => {
    expect(diff([1, 10.001, 3], [1, 10.002, 3], { tolerance: 0.01 })).toEqual([]);
    expect(diff([{ v: 1 }, 'z'], [{ v: 2 }, 'z'])).toEqual([
      { kind: 'changed', path: '$[0].v', left: 1, right: 2, delta: 1 },
    ]);
  });

  it('reports deltas without floating point noise', () => {
    expect(diff(2376.58, 2376.59)).toEqual([
      { kind: 'changed', path: '$', left: 2376.58, right: 2376.59, delta: 0.01 },
    ]);
    expect(diff(1e-7, 3e-7)[0]).toMatchObject({ delta: 2e-7 });
    expect(diff(1e21, 2e21)[0]).toMatchObject({ delta: 1e21 });
  });

  it('reports changed strings and booleans without a delta', () => {
    expect(diff({ s: 'a', b: true }, { s: 'b', b: false })).toEqual([
      { kind: 'changed', path: '$.b', left: true, right: false },
      { kind: 'changed', path: '$.s', left: 'a', right: 'b' },
    ]);
  });

  it('treats null and missing differently', () => {
    expect(diff({ a: null }, {})).toEqual([{ kind: 'removed', path: '$.a', left: null }]);
  });

  it('reports nested paths', () => {
    expect(diff({ rows: [{ amount: 10 }] }, { rows: [{ amount: 12 }] })[0]?.path).toBe(
      '$.rows[0].amount',
    );
  });

  it('applies absolute and relative tolerances', () => {
    expect(isEqual({ x: 100 }, { x: 100.004 }, { tolerance: 0.005 })).toBe(true);
    expect(isEqual({ x: 100 }, { x: 100.01 }, { tolerance: 0.005 })).toBe(false);
    expect(isEqual(1000, 1000.9, { relativeTolerance: 0.001 })).toBe(true);
    expect(isEqual(1000, 1002, { relativeTolerance: 0.001 })).toBe(false);
    expect(isEqual(0.1 + 0.2, 0.3, { tolerance: 0.1 })).toBe(true);
  });

  it('compares exactly when no tolerance is set', () => {
    expect(isEqual(0.1 + 0.2, 0.3)).toBe(false);
  });

  it('applies normalization before comparing', () => {
    expect(
      isEqual(
        { items: ['b', 'a'], meta: { at: 1 } },
        { items: ['a', 'b'], meta: { at: 2 } },
        {
          ignoreArrayOrder: true,
          ignorePaths: ['$.meta.at'],
        },
      ),
    ).toBe(true);
  });

  it('validates tolerances', () => {
    expect(() => diff(1, 2, { tolerance: -1 })).toThrow(RangeError);
    expect(() => diff(1, 2, { relativeTolerance: Number.NaN })).toThrow(RangeError);
  });

  it('compares numbers on their own', () => {
    expect(numbersMatch(1, 1)).toBe(true);
    expect(numbersMatch(1, 1.5, { tolerance: 0.5 })).toBe(true);
    expect(numbersMatch(1, 1.6, { tolerance: 0.5 })).toBe(false);
  });
});
