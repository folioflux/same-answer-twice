# same-answer-twice

Does your AI agent give the same answer to the same question twice? A small CLI and TypeScript library that runs a question or calculation several times and checks that the answers match, with stable hashes and a clear diff when they do not.

> **Status:** early (v0.1.0). The API may change before 1.0. Not yet published to npm; install from source for now.

## What it is

Agents that answer questions over data (totals, counts, lists of rows) should be reproducible: ask the same thing over the same data and you should get the same answer. same-answer-twice makes that easy to check:

- **Run N times, compare once.** Run a command or a function several times, or compare answers you have already saved.
- **Structured comparison.** Answers are compared as data, not text: object key order does not matter, `-0` equals `0`, and every difference is reported with its path, for example `$.totals.expenses`.
- **Stable hashing.** Every answer gets a SHA-256 hash of its canonical form, so equal answers always hash the same.
- **Number-aware.** Optional absolute or relative tolerances and rounding, and a `numbers` mode that compares only the numbers in a free-text answer.
- **Noise control.** Ignore volatile fields such as timestamps (`--ignore-path '$.generatedAt'`), and optionally ignore array order, case or whitespace.
- **Ground truth (optional).** Also compare every run with a known-correct answer.
- **Reproducible reports.** Text, Markdown or JSON. Reports contain no timestamps, so the same runs give the same report file.

No runtime dependencies. Everything runs locally.

## Install

Requires Node.js 24 or later.

```sh
git clone https://github.com/folioflux/same-answer-twice.git
cd same-answer-twice
pnpm install
pnpm build
node dist/cli.js --help
```

To use the CLI from anywhere, run `npm link` in the repository (or call `node /path/to/same-answer-twice/dist/cli.js`).

## Quick start

Run a command three times and compare what it prints:

```sh
same-answer-twice run --runs 3 -- node examples/agents/flaky-agent.mjs
```

```text
same-answer-twice: NOT CONSISTENT (3 runs, 2 distinct answers)

Answers:
  A 1501c4662ce0  runs 1, 3 (baseline)
  B 5b8d531c9d16  run 2

Run 2 vs run 1:
  ~ $.expenses: 1098.79 -> 1048.8 (-49.99)
  ~ $.net: 3151.21 -> 3201.2 (+49.99)
  - $.sourceRows[2]: 3
```

The exit code is `0` when every run gave the same answer, `1` when answers differ or a run failed, and `2` for usage errors, so it works in CI and scripts.

## Examples

All examples use small synthetic data in [`examples/`](examples). Run them all with `pnpm build && pnpm examples`.

**Compare saved answers**, ignoring a timestamp field:

```sh
same-answer-twice compare --ignore-path '$.generatedAt' \
  examples/answers/run-1.json examples/answers/run-2.json examples/answers/run-3.json
```

```text
same-answer-twice: NOT CONSISTENT (3 runs, 2 distinct answers)

Answers:
  A d49ecab9fc7c  runs 1, 2 (baseline)
  B 739cd86267e0  run 3

Run 3 vs run 1:
  ~ $.expenses: 1873.42 -> 1837.42 (-36)
  ~ $.net: 2376.58 -> 2412.58 (+36)
  - $.sourceRows[3]: 9
```

**Check against a known-correct answer** as well:

```sh
same-answer-twice compare --ignore-path '$.generatedAt' --expected examples/answers/expected.json \
  examples/answers/run-1.json examples/answers/run-2.json
```

**Compare free-text answers by their numbers** (`--mode numbers`), or as normalized text (`--mode text`):

```sh
same-answer-twice compare --mode numbers examples/text/answer-1.txt examples/text/answer-2.txt
```

**Allow small differences** with `--tolerance 0.01` (absolute), `--relative-tolerance 0.001` (0.1%) or `--precision 2` (round first).

**Print stable hashes:**

```sh
same-answer-twice hash --ignore-path '$.generatedAt' examples/answers/run-1.json examples/answers/run-2.json
```

**Save a JSON report** for later comparison with `--output report.json`, or print Markdown for a pull request comment with `--format markdown`.

Each run of `same-answer-twice run` gets `SAME_ANSWER_TWICE_RUN=<n>` in its environment. Commands are started directly, without a shell.

## Library

```ts
import {
  checkDeterminism,
  formatReport,
  runRepeatedly,
  stableHash,
} from '@folioflux/same-answer-twice';

// Compare answers you already have.
const report = checkDeterminism([answerA, answerB], { ignorePaths: ['$.generatedAt'] });
console.log(report.consistent, report.hashes);

// Or run your own agent call several times.
const runs = await runRepeatedly(() => askMyAgent('What were total expenses in January?'), {
  runs: 3,
  tolerance: 0.005,
  expected: { expenses: 1873.42 },
});
console.log(formatReport(runs, 'markdown'));

stableHash({ b: 2, a: 1 }) === stableHash({ a: 1, b: 2 }); // true
```

See [`examples/library.mjs`](examples/library.mjs) for a runnable version.

Main exports:

| Export                                            | Purpose                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `runRepeatedly(task, options)`                    | Run a sync or async task N times (default 2) and return a report.         |
| `sameAnswerTwice(task, options)`                  | Shorthand for two runs.                                                   |
| `checkDeterminism(answers, options)`              | Check answers you already have. `checkOutcomes` also accepts failed runs. |
| `diff(left, right, options)` / `isEqual`          | Structural diff with paths, tolerances and aligned arrays.                |
| `normalize` / `canonicalize` / `stableHash`       | Canonical JSON form and SHA-256 hash.                                     |
| `formatReport(report, format)`                    | Render a report as `text`, `markdown` or `json`.                          |
| `extractNumbers(text)` / `parseAnswer(raw, mode)` | Helpers for free-text answers.                                            |

Options shared by the CLI and library: `tolerance`, `relativeTolerance`, `precision`, `ignorePaths`, `ignoreArrayOrder`, `ignoreCase`, `normalizeWhitespace` and `expected`. Path patterns look like `$.meta.generatedAt` or `$.rows[*].id`, where `*` matches any single key or index.

## Limits

- It checks that answers are the same, not that they are right. Use `expected` when you have a known-correct answer.
- Answers must be JSON, plain text or numbers in text. The `numbers` mode reads `.` as the decimal separator and `,` as a thousands separator, and reads dates such as `2026-01-31` as three numbers.
- Array diffs align exactly equal items; when items are reordered and changed at the same time the diff can be longer than the smallest possible one. Use `--ignore-array-order` when order does not matter.
- It does not call any model or agent for you. Bring your own command or function.
- Runs are sequential by default. Repeated runs against a paid API cost money; choose `--runs` accordingly.

## About

Built by the FolioFlux team. FolioFlux is the AI finance workspace for freelancers, small teams and their accountants: https://folioflux.com

Questions: hello@folioflux.com. Security reports: see [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Disclaimer

Not financial, tax, accounting or legal advice.

## Licence

Released under the [MIT License](LICENSE).
