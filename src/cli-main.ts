import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { AnswerMode } from './answers.js';
import { ANSWER_MODES, parseAnswer } from './answers.js';
import type { CheckOptions, DeterminismReport, RunOutcome } from './check.js';
import { checkOutcomes, errorMessage } from './check.js';
import { runCommand } from './exec.js';
import { parsePathPattern } from './paths.js';
import { stableHash } from './hash.js';
import type { ReportFormat } from './report.js';
import { REPORT_FORMATS, formatReport } from './report.js';
import { runRepeatedly } from './run.js';
import { VERSION } from './version.js';

/** Where the CLI writes output. Injected so the CLI can be tested in-process. */
export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
}

/** Exit codes used by the CLI. */
export const EXIT = { consistent: 0, inconsistent: 1, usage: 2 } as const;

export const USAGE = `same-answer-twice ${VERSION}
Check that the same question gets the same answer twice.

Usage:
  same-answer-twice compare [options] <answer> <answer> [<answer>...]
      Compare saved answers (files). The first file is the baseline.
  same-answer-twice run [options] -- <command> [args...]
      Run a command several times and compare what it prints to stdout.
      Each run gets SAME_ANSWER_TWICE_RUN=<n> in its environment.
  same-answer-twice hash [options] <file> [<file>...]
      Print the stable hash of each answer.

Options:
  --mode <json|text|numbers>     How to read answers (default: json)
  --runs <n>                     Runs for "run" (default: 2)
  --concurrency <n>              Parallel runs for "run" (default: 1)
  --timeout <ms>                 Per-run timeout for "run" (default: 120000)
  --expected <file>              Also compare every answer with a known-correct answer
  --tolerance <x>                Treat numbers within x of each other as equal
  --relative-tolerance <x>       Treat numbers within x * max(|a|, |b|) as equal
  --precision <n>                Round numbers to n decimal places before comparing
  --ignore-path <path>           Ignore a path such as '$.meta.generatedAt' (repeatable)
  --ignore-array-order           Treat arrays as unordered
  --ignore-case                  Compare strings case-insensitively
  --normalize-whitespace         Trim and collapse whitespace inside strings
  --format <text|markdown|json>  Report format (default: text)
  --output <file>                Also write the JSON report to this file
  -h, --help                     Show this help
  -v, --version                  Show the version

Exit codes: 0 = same answer every run, 1 = answers differ or a run failed, 2 = usage error.
`;

class UsageError extends Error {}

const OPTIONS = {
  mode: { type: 'string' },
  runs: { type: 'string' },
  concurrency: { type: 'string' },
  timeout: { type: 'string' },
  expected: { type: 'string' },
  tolerance: { type: 'string' },
  'relative-tolerance': { type: 'string' },
  precision: { type: 'string' },
  'ignore-path': { type: 'string', multiple: true },
  'ignore-array-order': { type: 'boolean' },
  'ignore-case': { type: 'boolean' },
  'normalize-whitespace': { type: 'boolean' },
  format: { type: 'string' },
  output: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>['values'];

/** Runs the CLI with the given arguments and returns the exit code. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`Error: ${error.message}\nRun "same-answer-twice --help" for usage.\n`);
    } else {
      io.stderr(`Error: ${errorMessage(error)}\n`);
    }
    return EXIT.usage;
  }
}

async function dispatch(argv: readonly string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError(errorMessage(error));
  }
  const { values, positionals } = parsed;

  if (values.help) {
    io.stdout(USAGE);
    return EXIT.consistent;
  }
  if (values.version) {
    io.stdout(`${VERSION}\n`);
    return EXIT.consistent;
  }

  const [command, ...rest] = positionals;
  const mode = parseChoice(values.mode, ANSWER_MODES, 'mode', 'json');
  const format = parseChoice(values.format, REPORT_FORMATS, 'format', 'text');
  const checkOptions = await buildCheckOptions(values, mode, io);

  switch (command) {
    case 'compare': {
      if (rest.length < 2) throw new UsageError('compare needs at least 2 answer files');
      const outcomes = await Promise.all(
        rest.map(async (file): Promise<RunOutcome> => {
          try {
            return { ok: true, value: parseAnswer(await readText(file, io), mode) };
          } catch (error) {
            return { ok: false, error: `${file}: ${errorMessage(error)}` };
          }
        }),
      );
      return finish(checkOutcomes(outcomes, checkOptions), format, values, io);
    }
    case 'run': {
      const [program, ...args] = rest;
      if (program === undefined) {
        throw new UsageError('run needs a command, e.g. same-answer-twice run -- node agent.js');
      }
      const runs = parseInteger(values.runs, 'runs', 2, 2);
      const concurrency = parseInteger(values.concurrency, 'concurrency', 1, 1);
      const timeoutMs = parseInteger(values.timeout, 'timeout', 120_000, 1);
      const report = await runRepeatedly(
        async (run) =>
          parseAnswer(
            await runCommand(program, args, {
              cwd: io.cwd,
              timeoutMs,
              env: { SAME_ANSWER_TWICE_RUN: String(run) },
            }),
            mode,
          ),
        { ...checkOptions, runs, concurrency },
      );
      return finish(report, format, values, io);
    }
    case 'hash': {
      if (rest.length === 0) throw new UsageError('hash needs at least 1 file');
      const { expected: _expected, ...normalizeOptions } = checkOptions;
      for (const file of rest) {
        const answer = parseAnswer(await readText(file, io), mode);
        io.stdout(`${stableHash(answer, normalizeOptions)}  ${file}\n`);
      }
      return EXIT.consistent;
    }
    case undefined:
      io.stdout(USAGE);
      return EXIT.usage;
    default:
      throw new UsageError(`unknown command "${command}"`);
  }
}

async function finish(
  report: DeterminismReport,
  format: ReportFormat,
  values: Values,
  io: CliIo,
): Promise<number> {
  io.stdout(formatReport(report, format));
  if (values.output !== undefined) {
    await writeFile(resolve(io.cwd, values.output), formatReport(report, 'json'), 'utf8');
  }
  const expectedOk = report.expected ? report.expected.allMatch : true;
  return report.consistent && expectedOk ? EXIT.consistent : EXIT.inconsistent;
}

async function buildCheckOptions(
  values: Values,
  mode: AnswerMode,
  io: CliIo,
): Promise<CheckOptions> {
  const options: CheckOptions = {};
  if (values.tolerance !== undefined) {
    options.tolerance = parseNumber(values.tolerance, 'tolerance');
  }
  if (values['relative-tolerance'] !== undefined) {
    options.relativeTolerance = parseNumber(values['relative-tolerance'], 'relative-tolerance');
  }
  if (values.precision !== undefined) {
    options.precision = parseInteger(values.precision, 'precision', 0, 0);
  }
  if (values['ignore-path']) {
    for (const pattern of values['ignore-path']) {
      try {
        parsePathPattern(pattern);
      } catch (error) {
        throw new UsageError(`--ignore-path: ${errorMessage(error)}`);
      }
    }
    options.ignorePaths = values['ignore-path'];
  }
  if (values['ignore-array-order']) options.ignoreArrayOrder = true;
  if (values['ignore-case']) options.ignoreCase = true;
  if (values['normalize-whitespace']) options.normalizeWhitespace = true;
  if (values.expected !== undefined) {
    options.expected = parseAnswer(await readText(values.expected, io), mode);
  }
  return options;
}

async function readText(file: string, io: CliIo): Promise<string> {
  try {
    return await readFile(resolve(io.cwd, file), 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new Error(code === 'ENOENT' ? `File not found: ${file}` : errorMessage(error), {
      cause: error,
    });
  }
}

function parseChoice<T extends string>(
  value: string | undefined,
  choices: readonly T[],
  name: string,
  fallback: T,
): T {
  if (value === undefined) return fallback;
  if ((choices as readonly string[]).includes(value)) return value as T;
  throw new UsageError(`--${name} must be one of: ${choices.join(', ')}`);
}

function parseNumber(value: string, name: string): number {
  const number = Number(value);
  if (value.trim() === '' || !Number.isFinite(number) || number < 0) {
    throw new UsageError(`--${name} must be a number >= 0`);
  }
  return number;
}

function parseInteger(value: string | undefined, name: string, fallback: number, min: number) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(number) || number < min) {
    throw new UsageError(`--${name} must be an integer >= ${min}`);
  }
  return number;
}
