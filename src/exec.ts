import { spawn } from 'node:child_process';

/** Options for `runCommand`. */
export interface CommandOptions {
  cwd?: string;
  /** Kill the command after this many milliseconds. */
  timeoutMs?: number;
  /** Extra environment variables for the command. */
  env?: Record<string, string>;
  /** Fail when stdout grows beyond this many bytes. Defaults to 16 MiB. */
  maxOutputBytes?: number;
}

/**
 * Runs a command without a shell and resolves with its stdout. Rejects when the command cannot
 * start, exits with a non-zero code, is killed by a signal, times out or prints too much.
 */
export function runCommand(
  command: string,
  args: readonly string[],
  options: CommandOptions = {},
): Promise<string> {
  const { timeoutMs = 120_000, maxOutputBytes = 16 * 1024 * 1024 } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = '';
    let failure: Error | undefined;

    const fail = (error: Error) => {
      if (failure) return;
      failure = error;
      child.kill('SIGTERM');
    };

    const timer = setTimeout(() => {
      fail(new Error(`Command timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) {
        fail(new Error(`Command printed more than ${maxOutputBytes} bytes`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      // Keep only the tail of stderr for error messages.
      stderr = (stderr + chunk.toString('utf8')).slice(-2000);
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Could not start "${command}": ${error.message}`));
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (failure) {
        reject(failure);
      } else if (code !== 0) {
        const detail = stderr.trim() ? `: ${stderr.trim()}` : '';
        const reason = signal ? `was killed by ${signal}` : `exited with code ${String(code)}`;
        reject(new Error(`Command ${reason}${detail}`));
      } else {
        resolve(Buffer.concat(stdout).toString('utf8'));
      }
    });
  });
}
