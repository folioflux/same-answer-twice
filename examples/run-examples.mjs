// Runs every example and checks its exit code. Used in CI after `pnpm build`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = ['dist/cli.js'];

const cases = [
  {
    name: 'saved answers that match once the timestamp is ignored',
    args: [
      ...cli,
      'compare',
      '--ignore-path',
      '$.generatedAt',
      'examples/answers/run-1.json',
      'examples/answers/run-2.json',
    ],
    exit: 0,
  },
  {
    name: 'a third answer that drifted',
    args: [
      ...cli,
      'compare',
      '--ignore-path',
      '$.generatedAt',
      'examples/answers/run-1.json',
      'examples/answers/run-2.json',
      'examples/answers/run-3.json',
    ],
    exit: 1,
  },
  {
    name: 'answers checked against a known-correct answer',
    args: [
      ...cli,
      'compare',
      '--ignore-path',
      '$.generatedAt',
      '--expected',
      'examples/answers/expected.json',
      'examples/answers/run-1.json',
      'examples/answers/run-2.json',
    ],
    exit: 0,
  },
  {
    name: 'free-text answers compared by their numbers',
    args: [
      ...cli,
      'compare',
      '--mode',
      'numbers',
      'examples/text/answer-1.txt',
      'examples/text/answer-2.txt',
    ],
    exit: 0,
  },
  {
    name: 'a deterministic command run three times',
    args: [
      ...cli,
      'run',
      '--runs',
      '3',
      '--ignore-path',
      '$.generatedAt',
      '--',
      process.execPath,
      'examples/agents/stable-agent.mjs',
    ],
    exit: 0,
  },
  {
    name: 'a flaky command run three times',
    args: [...cli, 'run', '--runs', '3', '--', process.execPath, 'examples/agents/flaky-agent.mjs'],
    exit: 1,
  },
  { name: 'the library example', args: ['examples/library.mjs'], exit: 0 },
];

let failed = 0;
for (const example of cases) {
  const result = spawnSync(process.execPath, example.args, { cwd: root, encoding: 'utf8' });
  const ok = result.status === example.exit;
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${example.name} (exit ${String(result.status)}, expected ${example.exit})`,
  );
  if (!ok) console.log(result.stdout, result.stderr);
}

if (failed > 0) {
  console.error(`${failed} example(s) failed`);
  process.exit(1);
}
