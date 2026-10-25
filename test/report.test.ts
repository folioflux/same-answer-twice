import { describe, expect, it } from 'vitest';
import {
  checkDeterminism,
  checkOutcomes,
  describe as describeDifference,
  formatReport,
} from '../src/index.js';

describe('formatReport', () => {
  const inconsistent = checkDeterminism([
    { total: 10, note: 'a' },
    { total: 12, note: 'a', extra: true },
  ]);

  it('renders a consistent report as text', () => {
    const text = formatReport(checkDeterminism([1, 1]));
    expect(text).toMatch(/^same-answer-twice: CONSISTENT \(2 runs, 1 distinct answer\)/);
    expect(text).toMatch(/A [0-9a-f]{12} {2}runs 1, 2 \(baseline\)/);
  });

  it('renders differences as text', () => {
    const text = formatReport(inconsistent, 'text');
    expect(text).toContain('NOT CONSISTENT (2 runs, 2 distinct answers)');
    expect(text).toContain('Run 2 vs run 1:');
    expect(text).toContain('  + $.extra: true');
    expect(text).toContain('  ~ $.total: 10 -> 12 (+2)');
  });

  it('renders Markdown', () => {
    const markdown = formatReport(inconsistent, 'markdown');
    expect(markdown).toContain('## same-answer-twice: ❌ NOT CONSISTENT');
    expect(markdown).toContain('| Answer | Hash | Runs |');
    expect(markdown).toContain('- `~ $.total: 10 -> 12 (+2)`');
  });

  it('renders JSON that parses back to the report', () => {
    expect(JSON.parse(formatReport(inconsistent, 'json'))).toEqual(inconsistent);
  });

  it('lists errors and expected-answer mismatches', () => {
    const report = checkOutcomes(
      [
        { ok: true, value: { total: 1 } },
        { ok: false, error: 'agent\ntimed out' },
      ],
      { expected: { total: 2 } },
    );
    const text = formatReport(report);
    expect(text).toContain('run 2: agent timed out');
    expect(text).toContain('NOT all runs match');
    expect(text).toContain('Run 1 vs expected:');
    expect(formatReport(report, 'markdown')).toContain('### Expected answer: not all runs match');
  });

  it('limits the number of differences shown', () => {
    const left = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`k${i}`, i]));
    const right = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`k${i}`, i + 1]));
    const text = formatReport(checkDeterminism([left, right]), 'text', { maxDifferences: 2 });
    expect(text).toContain('… and 3 more');
  });

  it('shortens long values', () => {
    const line = describeDifference(
      { kind: 'added', path: '$.long', right: 'x'.repeat(200) },
      { maxValueLength: 10 },
    );
    expect(line).toBe('+ $.long: "xxxxxxxx…');
  });
});
