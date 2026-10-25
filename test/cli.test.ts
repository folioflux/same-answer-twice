import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { EXIT, runCli } from '../src/cli-main.js';

const root = fileURLToPath(new URL('..', import.meta.url));

async function cli(args: string[], cwd = root) {
  let stdout = '';
  let stderr = '';
  const code = await runCli(args, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    cwd,
  });
  return { code, stdout, stderr };
}

describe('cli compare', () => {
  const ignore = ['--ignore-path', '$.generatedAt'];
  const run1 = 'examples/answers/run-1.json';
  const run2 = 'examples/answers/run-2.json';
  const run3 = 'examples/answers/run-3.json';

  it('exits 0 when answers match', async () => {
    const result = await cli(['compare', ...ignore, run1, run2]);
    expect(result.code).toBe(EXIT.consistent);
    expect(result.stdout).toContain('CONSISTENT (2 runs, 1 distinct answer)');
  });

  it('exits 1 and shows a diff when answers differ', async () => {
    const result = await cli(['compare', ...ignore, run1, run2, run3]);
    expect(result.code).toBe(EXIT.inconsistent);
    expect(result.stdout).toContain('~ $.expenses: 1873.42 -> 1837.42 (-36)');
    expect(result.stdout).toContain('- $.sourceRows[3]: 9');
  });

  it('does not ignore anything unless asked', async () => {
    const result = await cli(['compare', run1, run2]);
    expect(result.code).toBe(EXIT.inconsistent);
    expect(result.stdout).toContain('$.generatedAt');
  });

  it('checks against an expected answer', async () => {
    const ok = await cli([
      'compare',
      ...ignore,
      '--expected',
      'examples/answers/expected.json',
      run1,
      run2,
    ]);
    expect(ok.code).toBe(EXIT.consistent);
    expect(ok.stdout).toContain('all runs match');

    const bad = await cli(['compare', '--expected', 'examples/answers/expected.json', run1, run2]);
    expect(bad.code).toBe(EXIT.inconsistent);
  });

  it('compares free text by its numbers', async () => {
    const files = ['examples/text/answer-1.txt', 'examples/text/answer-2.txt'];
    expect((await cli(['compare', '--mode', 'numbers', ...files])).code).toBe(EXIT.consistent);
    expect((await cli(['compare', '--mode', 'text', ...files])).code).toBe(EXIT.inconsistent);
  });

  it('applies a tolerance', async () => {
    const result = await cli([
      'compare',
      ...ignore,
      '--tolerance',
      '40',
      '--ignore-path',
      '$.sourceRows',
      run1,
      run3,
    ]);
    expect(result.code).toBe(EXIT.consistent);
  });

  it('prints JSON and writes a report file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sat-'));
    const output = join(dir, 'report.json');
    const result = await cli([
      'compare',
      '--format',
      'json',
      '--output',
      output,
      join(root, run1),
      join(root, run3),
    ]);
    expect(result.code).toBe(EXIT.inconsistent);
    const fromStdout: unknown = JSON.parse(result.stdout);
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(fromStdout);
  });

  it('records unreadable or invalid files as failed runs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sat-'));
    await writeFile(join(dir, 'bad.json'), '{ not json', 'utf8');
    await writeFile(join(dir, 'good.json'), '{}', 'utf8');
    const result = await cli(['compare', 'good.json', 'bad.json', 'missing.json'], dir);
    expect(result.code).toBe(EXIT.inconsistent);
    expect(result.stdout).toContain('run 2: bad.json: Output is not valid JSON');
    expect(result.stdout).toContain('run 3: missing.json: File not found: missing.json');
  });
});

describe('cli run', () => {
  it('runs a deterministic command', async () => {
    const result = await cli([
      'run',
      '--runs',
      '3',
      '--ignore-path',
      '$.generatedAt',
      '--',
      process.execPath,
      'examples/agents/stable-agent.mjs',
    ]);
    expect(result.stderr).toBe('');
    expect(result.code).toBe(EXIT.consistent);
    expect(result.stdout).toContain('runs 1, 2, 3 (baseline)');
  });

  it('catches a flaky command', async () => {
    const result = await cli([
      'run',
      '--runs',
      '3',
      '--',
      process.execPath,
      'examples/agents/flaky-agent.mjs',
    ]);
    expect(result.code).toBe(EXIT.inconsistent);
    expect(result.stdout).toContain('Run 2 vs run 1:');
    expect(result.stdout).toContain('- $.sourceRows[2]: 3');
  });

  it('reports a failing command as a failed run', async () => {
    const result = await cli(['run', '--', process.execPath, '-e', 'process.exit(3)']);
    expect(result.code).toBe(EXIT.inconsistent);
    expect(result.stdout).toContain('Command exited with code 3');
  });

  it('reports a command that cannot start', async () => {
    const result = await cli(['run', '--', 'definitely-not-a-real-command-xyz']);
    expect(result.code).toBe(EXIT.inconsistent);
    expect(result.stdout).toContain('Could not start');
  });

  it('times out slow commands', async () => {
    const result = await cli([
      'run',
      '--timeout',
      '200',
      '--',
      process.execPath,
      '-e',
      'setTimeout(() => {}, 10000)',
    ]);
    expect(result.code).toBe(EXIT.inconsistent);
    expect(result.stdout).toContain('timed out after 200 ms');
  });
});

describe('cli hash', () => {
  it('prints the same hash for equivalent answers', async () => {
    const result = await cli([
      'hash',
      '--ignore-path',
      '$.generatedAt',
      'examples/answers/run-1.json',
      'examples/answers/run-2.json',
    ]);
    expect(result.code).toBe(EXIT.consistent);
    const hashes = result.stdout
      .trim()
      .split('\n')
      .map((line) => line.split('  ')[0]);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes[0]).toBe(hashes[1]);
  });
});

describe('cli usage', () => {
  beforeAll(() => undefined);

  it('prints help and version', async () => {
    expect((await cli(['--help'])).stdout).toContain('Usage:');
    expect((await cli(['--version'])).stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it.each([
    [[]],
    [['nope']],
    [['compare', 'one.json']],
    [['run']],
    [['hash']],
    [['compare', '--mode', 'xml', 'a', 'b']],
    [['compare', '--tolerance', 'abc', 'a', 'b']],
    [['run', '--runs', '1', '--', 'node']],
    [['compare', '--unknown', 'a', 'b']],
    [['compare', '--ignore-path', '$..x', 'a', 'b']],
  ])('exits 2 for %j', async (args) => {
    expect((await cli(args)).code).toBe(EXIT.usage);
  });
});
