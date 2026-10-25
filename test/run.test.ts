import { describe, expect, it } from 'vitest';
import { runRepeatedly, sameAnswerTwice } from '../src/index.js';

describe('runRepeatedly', () => {
  it('runs the task the requested number of times with 1-based run numbers', async () => {
    const seen: number[] = [];
    const report = await runRepeatedly(
      (run) => {
        seen.push(run);
        return { answer: 42 };
      },
      { runs: 4 },
    );
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(report.consistent).toBe(true);
    expect(report.runs).toBe(4);
  });

  it('detects a flaky task', async () => {
    const report = await runRepeatedly((run) => Promise.resolve({ answer: run === 2 ? 41 : 42 }), {
      runs: 3,
    });
    expect(report.consistent).toBe(false);
    expect(report.groups.map((group) => group.runs)).toEqual([[1, 3], [2]]);
  });

  it('records thrown errors and rejections', async () => {
    const report = await runRepeatedly(
      (run) => {
        if (run === 1) throw new Error('boom');
        if (run === 2) return Promise.reject(new Error('nope'));
        return 1;
      },
      { runs: 3 },
    );
    expect(report.errors).toEqual([
      { run: 1, error: 'boom' },
      { run: 2, error: 'nope' },
    ]);
  });

  it('keeps run order with concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const report = await runRepeatedly(
      async (run) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, (5 - run) * 5));
        active -= 1;
        return run;
      },
      { runs: 5, concurrency: 2 },
    );
    expect(maxActive).toBe(2);
    expect(report.groups.map((group) => group.runs)).toEqual([[1], [2], [3], [4], [5]]);
  });

  it('validates options', async () => {
    await expect(runRepeatedly(() => 1, { runs: 1 })).rejects.toThrow(RangeError);
    await expect(runRepeatedly(() => 1, { concurrency: 0 })).rejects.toThrow(RangeError);
  });
});

describe('sameAnswerTwice', () => {
  it('runs exactly twice', async () => {
    let calls = 0;
    const report = await sameAnswerTwice(() => {
      calls += 1;
      return 'same';
    });
    expect(calls).toBe(2);
    expect(report.consistent).toBe(true);
  });
});
