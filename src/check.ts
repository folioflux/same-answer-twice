import type { CompareOptions, Difference } from './diff.js';
import { diff } from './diff.js';
import { stableHash } from './hash.js';
import type { Json } from './json.js';
import { normalize } from './normalize.js';

/** The outcome of a single run: an answer, or the error it failed with. */
export type RunOutcome = { ok: true; value: unknown } | { ok: false; error: string };

/** Options for a determinism check. */
export interface CheckOptions extends CompareOptions {
  /**
   * An optional known-correct answer. When given, every run is also compared against it and
   * the report says whether all runs match it.
   */
  expected?: unknown;
}

/** One run compared against a reference (the first successful run, or the expected answer). */
export interface RunComparison {
  /** 1-based run number. */
  run: number;
  equal: boolean;
  differences: Difference[];
}

/** A set of runs that gave the same answer (within tolerances). */
export interface AnswerGroup {
  /** 1-based run numbers in this group, in ascending order. */
  runs: number[];
  /** Stable hash of the group's first answer. */
  hash: string;
}

/** The full result of a determinism check. Contains no timestamps, so it is reproducible. */
export interface DeterminismReport {
  /** True when every run succeeded and every answer matched the baseline. */
  consistent: boolean;
  /** Number of runs checked. */
  runs: number;
  /** 1-based number of the run used as the baseline, or null when every run failed. */
  baselineRun: number | null;
  /** Number of distinct answers among successful runs. */
  distinctAnswers: number;
  /** Stable hash of each run's normalized answer (null for failed runs), in run order. */
  hashes: (string | null)[];
  /** Successful runs grouped by answer. The first group contains the baseline. */
  groups: AnswerGroup[];
  /** Every successful run except the baseline, compared with the baseline. */
  comparisons: RunComparison[];
  /** Runs that failed, with their error messages. */
  errors: { run: number; error: string }[];
  /** Present only when `expected` was given. */
  expected?: {
    /** True when every successful run matched the expected answer and no run failed. */
    allMatch: boolean;
    hash: string;
    comparisons: RunComparison[];
  };
}

/**
 * Checks whether a list of answers from repeated runs are the same.
 *
 * The first answer is the baseline. Answers are normalized (see `NormalizeOptions`) and compared
 * structurally, with optional numeric tolerances. Use `checkOutcomes` when some runs may fail.
 */
export function checkDeterminism(
  answers: readonly unknown[],
  options: CheckOptions = {},
): DeterminismReport {
  return checkOutcomes(
    answers.map((value) => ({ ok: true as const, value })),
    options,
  );
}

/** Like `checkDeterminism`, but accepts failed runs too. */
export function checkOutcomes(
  outcomes: readonly RunOutcome[],
  options: CheckOptions = {},
): DeterminismReport {
  if (outcomes.length < 2) {
    throw new RangeError('A determinism check needs at least 2 runs');
  }
  const { expected, ...compareOptions } = options;
  // Fail fast on invalid options (bad path patterns, precision or tolerances) instead of
  // reporting them as a failure of every run.
  diff(null, null, compareOptions);

  const hashes: (string | null)[] = [];
  const errors: { run: number; error: string }[] = [];
  const successes: { run: number; value: Json; hash: string }[] = [];

  outcomes.forEach((outcome, index) => {
    const run = index + 1;
    if (!outcome.ok) {
      hashes.push(null);
      errors.push({ run, error: outcome.error });
      return;
    }
    try {
      const value = normalize(outcome.value, compareOptions);
      const hash = stableHash(value);
      hashes.push(hash);
      successes.push({ run, value, hash });
    } catch (error) {
      hashes.push(null);
      errors.push({ run, error: errorMessage(error) });
    }
  });

  const baseline = successes[0];
  const comparisons: RunComparison[] = [];
  const groups: (AnswerGroup & { value: Json })[] = [];

  for (const success of successes) {
    if (baseline && success !== baseline) {
      const differences = compareNormalized(baseline.value, success.value, compareOptions);
      comparisons.push({ run: success.run, equal: differences.length === 0, differences });
    }
    const group = groups.find(
      (candidate) =>
        candidate.hash === success.hash ||
        compareNormalized(candidate.value, success.value, compareOptions).length === 0,
    );
    if (group) group.runs.push(success.run);
    else groups.push({ runs: [success.run], hash: success.hash, value: success.value });
  }

  const report: DeterminismReport = {
    consistent: errors.length === 0 && groups.length === 1,
    runs: outcomes.length,
    baselineRun: baseline?.run ?? null,
    distinctAnswers: groups.length,
    hashes,
    groups: groups.map(({ runs, hash }) => ({ runs, hash })),
    comparisons,
    errors,
  };

  if (expected !== undefined) {
    const expectedValue = normalize(expected, compareOptions);
    const expectedComparisons = successes.map(({ run, value }) => {
      const differences = compareNormalized(expectedValue, value, compareOptions);
      return { run, equal: differences.length === 0, differences };
    });
    report.expected = {
      allMatch:
        errors.length === 0 &&
        expectedComparisons.length > 0 &&
        expectedComparisons.every((comparison) => comparison.equal),
      hash: stableHash(expectedValue),
      comparisons: expectedComparisons,
    };
  }

  return report;
}

/**
 * Values here are already normalized, so only tolerances still apply. Normalizing again is
 * idempotent except for ignorePaths and array ordering, which we must not re-apply to indices
 * that have already moved, so they are stripped here.
 */
function compareNormalized(left: Json, right: Json, options: CompareOptions): Difference[] {
  const { tolerance, relativeTolerance } = options;
  return diff(left, right, {
    ...(tolerance === undefined ? {} : { tolerance }),
    ...(relativeTolerance === undefined ? {} : { relativeTolerance }),
  });
}

/** Turns anything thrown into a readable message. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    const json = JSON.stringify(error) as string | undefined;
    return json ?? String(error);
  } catch {
    return String(error);
  }
}
