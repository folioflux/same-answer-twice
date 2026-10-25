import type { CheckOptions, DeterminismReport, RunOutcome } from './check.js';
import { checkOutcomes, errorMessage } from './check.js';

/** A task to repeat. It receives the 1-based run number. */
export type Task<T> = (run: number) => T | Promise<T>;

/** Options for `runRepeatedly`. */
export interface RunOptions extends CheckOptions {
  /** How many times to run the task. Defaults to 2. Must be at least 2. */
  runs?: number;
  /**
   * How many runs may be in flight at once. Defaults to 1 (one after another), which is the
   * safest choice for agents that share state or rate limits.
   */
  concurrency?: number;
}

/**
 * Runs `task` several times and checks that every run gives the same answer.
 *
 * A run that throws or rejects is recorded as an error and makes the report inconsistent.
 */
export async function runRepeatedly<T>(
  task: Task<T>,
  options: RunOptions = {},
): Promise<DeterminismReport> {
  const { runs = 2, concurrency = 1, ...checkOptions } = options;
  if (!Number.isInteger(runs) || runs < 2) throw new RangeError('runs must be an integer >= 2');
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('concurrency must be an integer >= 1');
  }

  const outcomes: RunOutcome[] = new Array<RunOutcome>(runs);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < runs) {
      const index = next;
      next += 1;
      try {
        outcomes[index] = { ok: true, value: await task(index + 1) };
      } catch (error) {
        outcomes[index] = { ok: false, error: errorMessage(error) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, runs) }, worker));

  return checkOutcomes(outcomes, checkOptions);
}

/** Runs `task` twice and checks that both runs give the same answer. */
export function sameAnswerTwice<T>(
  task: Task<T>,
  options: Omit<RunOptions, 'runs'> = {},
): Promise<DeterminismReport> {
  return runRepeatedly(task, { ...options, runs: 2 });
}
