import type { DeterminismReport, RunComparison } from './check.js';
import type { Difference } from './diff.js';
import { shortHash } from './hash.js';
import type { Json } from './json.js';
import { canonicalStringify } from './normalize.js';

/** Output formats supported by `formatReport`. */
export type ReportFormat = 'text' | 'markdown' | 'json';

export const REPORT_FORMATS: readonly ReportFormat[] = ['text', 'markdown', 'json'];

/** Options for `formatReport`. */
export interface FormatOptions {
  /** Maximum number of differences listed per run. Defaults to 50. */
  maxDifferences?: number;
  /** Values longer than this many characters are shortened in text and Markdown. Defaults to 80. */
  maxValueLength?: number;
}

/** Renders a report as plain text, Markdown or pretty-printed JSON. */
export function formatReport(
  report: DeterminismReport,
  format: ReportFormat = 'text',
  options: FormatOptions = {},
): string {
  switch (format) {
    case 'json':
      return `${JSON.stringify(report, null, 2)}\n`;
    case 'markdown':
      return formatMarkdown(report, options);
    case 'text':
      return formatText(report, options);
  }
}

function verdict(report: DeterminismReport): string {
  return report.consistent ? 'CONSISTENT' : 'NOT CONSISTENT';
}

function runList(runs: readonly number[]): string {
  return `${runs.length === 1 ? 'run' : 'runs'} ${runs.join(', ')}`;
}

function summary(report: DeterminismReport): string {
  const answers = `${report.distinctAnswers} distinct ${report.distinctAnswers === 1 ? 'answer' : 'answers'}`;
  const failed = report.errors.length > 0 ? `, ${report.errors.length} failed` : '';
  return `${report.runs} runs, ${answers}${failed}`;
}

function formatText(report: DeterminismReport, options: FormatOptions): string {
  const lines: string[] = [`same-answer-twice: ${verdict(report)} (${summary(report)})`];
  const label = groupLabeller();

  if (report.groups.length > 0) {
    lines.push('', 'Answers:');
    for (const group of report.groups) {
      lines.push(
        `  ${label()} ${shortHash(group.hash)}  ${runList(group.runs)}${
          group.runs.includes(report.baselineRun ?? -1) ? ' (baseline)' : ''
        }`,
      );
    }
  }

  const differing = report.comparisons.filter((comparison) => !comparison.equal);
  for (const comparison of differing) {
    lines.push('', `Run ${comparison.run} vs run ${report.baselineRun ?? '?'}:`);
    lines.push(...differenceLines(comparison, options).map((line) => `  ${line}`));
  }

  if (report.errors.length > 0) {
    lines.push('', 'Errors:');
    for (const { run, error } of report.errors) lines.push(`  run ${run}: ${oneLine(error)}`);
  }

  if (report.expected) {
    lines.push(
      '',
      `Expected answer ${shortHash(report.expected.hash)}: ${
        report.expected.allMatch ? 'all runs match' : 'NOT all runs match'
      }`,
    );
    for (const comparison of report.expected.comparisons.filter((c) => !c.equal)) {
      lines.push(`  Run ${comparison.run} vs expected:`);
      lines.push(...differenceLines(comparison, options).map((line) => `    ${line}`));
    }
  }

  return `${lines.join('\n')}\n`;
}

function formatMarkdown(report: DeterminismReport, options: FormatOptions): string {
  const lines: string[] = [
    `## same-answer-twice: ${report.consistent ? '✅' : '❌'} ${verdict(report)}`,
    '',
    summary(report),
  ];
  const label = groupLabeller();

  if (report.groups.length > 0) {
    lines.push('', '| Answer | Hash | Runs |', '| --- | --- | --- |');
    for (const group of report.groups) {
      lines.push(`| ${label()} | \`${shortHash(group.hash)}\` | ${group.runs.join(', ')} |`);
    }
  }

  const differing = report.comparisons.filter((comparison) => !comparison.equal);
  for (const comparison of differing) {
    lines.push('', `### Run ${comparison.run} vs run ${report.baselineRun ?? '?'}`, '');
    lines.push(...markdownDifferences(comparison, options));
  }

  if (report.errors.length > 0) {
    lines.push('', '### Errors', '');
    for (const { run, error } of report.errors) {
      lines.push(`- Run ${run}: ${escapeMarkdown(oneLine(error))}`);
    }
  }

  if (report.expected) {
    lines.push(
      '',
      `### Expected answer: ${report.expected.allMatch ? 'all runs match' : 'not all runs match'}`,
    );
    for (const comparison of report.expected.comparisons.filter((c) => !c.equal)) {
      lines.push('', `Run ${comparison.run} vs expected:`, '');
      lines.push(...markdownDifferences(comparison, options));
    }
  }

  return `${lines.join('\n')}\n`;
}

function markdownDifferences(comparison: RunComparison, options: FormatOptions): string[] {
  return differenceLines(comparison, options).map((line) => `- \`${line.replaceAll('`', "'")}\``);
}

function differenceLines(comparison: RunComparison, options: FormatOptions): string[] {
  const max = options.maxDifferences ?? 50;
  const lines = comparison.differences
    .slice(0, max)
    .map((difference) => describe(difference, options));
  const hidden = comparison.differences.length - max;
  if (hidden > 0) lines.push(`… and ${hidden} more`);
  return lines;
}

/** Describes one difference on a single line, e.g. `~ $.total: 100 -> 101 (+1)`. */
export function describe(difference: Difference, options: FormatOptions = {}): string {
  const show = (value: Json) => preview(value, options.maxValueLength ?? 80);
  switch (difference.kind) {
    case 'changed': {
      const delta =
        difference.delta === undefined
          ? ''
          : ` (${difference.delta > 0 ? '+' : ''}${difference.delta})`;
      return `~ ${difference.path}: ${show(difference.left)} -> ${show(difference.right)}${delta}`;
    }
    case 'type':
      return `~ ${difference.path}: ${show(difference.left)} -> ${show(difference.right)} (type changed)`;
    case 'added':
      return `+ ${difference.path}: ${show(difference.right)}`;
    case 'removed':
      return `- ${difference.path}: ${show(difference.left)}`;
  }
}

function preview(value: Json, maxLength: number): string {
  const text = canonicalStringify(value);
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function groupLabeller(): () => string {
  let index = 0;
  return () => {
    const label = index < 26 ? String.fromCharCode(65 + index) : `#${index + 1}`;
    index += 1;
    return label;
  };
}

function oneLine(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>|]/gu, (char) => `\\${char}`);
}
