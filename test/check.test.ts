import { describe, expect, it } from 'vitest';
import { checkDeterminism, checkOutcomes, stableHash } from '../src/index.js';

describe('checkDeterminism', () => {
  it('reports consistent answers', () => {
    const report = checkDeterminism([{ total: 10 }, { total: 10 }, { total: 10 }]);
    expect(report).toEqual({
      consistent: true,
      runs: 3,
      baselineRun: 1,
      distinctAnswers: 1,
      hashes: Array(3).fill(stableHash({ total: 10 })),
      groups: [{ runs: [1, 2, 3], hash: stableHash({ total: 10 }) }],
      comparisons: [
        { run: 2, equal: true, differences: [] },
        { run: 3, equal: true, differences: [] },
      ],
      errors: [],
    });
  });

  it('groups different answers and diffs each run against the baseline', () => {
    const report = checkDeterminism([{ total: 10 }, { total: 11 }, { total: 10 }, { total: 11 }]);
    expect(report.consistent).toBe(false);
    expect(report.distinctAnswers).toBe(2);
    expect(report.groups.map((group) => group.runs)).toEqual([
      [1, 3],
      [2, 4],
    ]);
    expect(report.comparisons[0]).toEqual({
      run: 2,
      equal: false,
      differences: [{ kind: 'changed', path: '$.total', left: 10, right: 11, delta: 1 }],
    });
  });

  it('groups answers within tolerance even when hashes differ', () => {
    const report = checkDeterminism([{ x: 1 }, { x: 1.0001 }], { tolerance: 0.001 });
    expect(report.consistent).toBe(true);
    expect(report.distinctAnswers).toBe(1);
    expect(report.hashes[0]).not.toBe(report.hashes[1]);
  });

  it('applies ignorePaths and ignoreArrayOrder', () => {
    const report = checkDeterminism(
      [
        { ids: [1, 2], generatedAt: 'a' },
        { ids: [2, 1], generatedAt: 'b' },
      ],
      { ignorePaths: ['$.generatedAt'], ignoreArrayOrder: true },
    );
    expect(report.consistent).toBe(true);
    expect(report.hashes[0]).toBe(report.hashes[1]);
  });

  it('compares with an expected answer', () => {
    const report = checkDeterminism([{ total: 10 }, { total: 10 }], { expected: { total: 12 } });
    expect(report.consistent).toBe(true);
    expect(report.expected?.allMatch).toBe(false);
    expect(report.expected?.comparisons[0]?.differences).toEqual([
      { kind: 'changed', path: '$.total', left: 12, right: 10, delta: -2 },
    ]);
    expect(checkDeterminism([1, 1], { expected: 1 }).expected?.allMatch).toBe(true);
  });

  it('needs at least two runs', () => {
    expect(() => checkDeterminism([1])).toThrow(RangeError);
  });

  it('is reproducible: the same input gives an identical report', () => {
    const answers = [{ a: [1, 2] }, { a: [1, 3] }];
    expect(JSON.stringify(checkDeterminism(answers))).toBe(
      JSON.stringify(checkDeterminism(answers)),
    );
  });
});

describe('checkOutcomes', () => {
  it('records failed runs and is never consistent with failures', () => {
    const report = checkOutcomes([
      { ok: false, error: 'timeout' },
      { ok: true, value: 1 },
      { ok: true, value: 1 },
    ]);
    expect(report.consistent).toBe(false);
    expect(report.baselineRun).toBe(2);
    expect(report.hashes[0]).toBeNull();
    expect(report.errors).toEqual([{ run: 1, error: 'timeout' }]);
    expect(report.comparisons).toEqual([{ run: 3, equal: true, differences: [] }]);
  });

  it('handles every run failing', () => {
    const report = checkOutcomes(
      [
        { ok: false, error: 'a' },
        { ok: false, error: 'b' },
      ],
      { expected: 1 },
    );
    expect(report.consistent).toBe(false);
    expect(report.baselineRun).toBeNull();
    expect(report.distinctAnswers).toBe(0);
    expect(report.expected?.allMatch).toBe(false);
  });

  it('turns answers that cannot be normalized into errors', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const report = checkOutcomes([
      { ok: true, value: 1 },
      { ok: true, value: circular },
    ]);
    expect(report.errors[0]?.run).toBe(2);
    expect(report.errors[0]?.error).toMatch(/circular/);
  });
});

describe('option validation', () => {
  it('throws on invalid options instead of failing every run', () => {
    expect(() => checkDeterminism([1, 1], { ignorePaths: ['$..x'] })).toThrow(SyntaxError);
    expect(() => checkDeterminism([1, 1], { precision: 99 })).toThrow(RangeError);
    expect(() => checkDeterminism([1, 1], { tolerance: -1 })).toThrow(RangeError);
  });
});
