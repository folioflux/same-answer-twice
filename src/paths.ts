/**
 * Paths identify a location inside a value, for example `$.totals.income` or `$.rows[2].amount`.
 *
 * Patterns used by `ignorePaths` use the same syntax and may contain `*` to match any single
 * key (`$.meta.*`) or any array index (`$.rows[*].id`).
 */

export type PathSegment = string | number;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Formats path segments as `$.key[0]["odd key"]`. */
export function formatPath(segments: readonly PathSegment[]): string {
  let out = '$';
  for (const segment of segments) {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
    } else if (IDENTIFIER.test(segment)) {
      out += `.${segment}`;
    } else {
      out += `[${JSON.stringify(segment)}]`;
    }
  }
  return out;
}

/** A parsed pattern segment. `wildcard` matches any single key or index. */
export type PatternSegment =
  { kind: 'key'; value: string } | { kind: 'index'; value: number } | { kind: 'wildcard' };

/** Parses a path pattern such as `$.rows[*].id` or `meta.generatedAt`. */
export function parsePathPattern(pattern: string): PatternSegment[] {
  const source = pattern.trim();
  if (source === '') throw new SyntaxError('Path pattern must not be empty');

  let i = 0;
  if (source.startsWith('$')) i = 1;
  const segments: PatternSegment[] = [];
  let expectSeparator = i === 1;

  const fail = (reason: string): never => {
    throw new SyntaxError(`Invalid path pattern "${pattern}": ${reason}`);
  };

  while (i < source.length) {
    const char = source[i];
    if (char === '.') {
      i += 1;
      const start = i;
      while (i < source.length && source[i] !== '.' && source[i] !== '[') i += 1;
      const key = source.slice(start, i);
      if (key === '') fail('empty key after "."');
      segments.push(key === '*' ? { kind: 'wildcard' } : { kind: 'key', value: key });
    } else if (char === '[') {
      const end = findClosingBracket(source, i);
      if (end === -1) fail('missing "]"');
      const inner = source.slice(i + 1, end).trim();
      i = end + 1;
      if (inner === '*') {
        segments.push({ kind: 'wildcard' });
      } else if (/^\d+$/.test(inner)) {
        segments.push({ kind: 'index', value: Number(inner) });
      } else if (inner.startsWith('"')) {
        let key: unknown;
        try {
          key = JSON.parse(inner);
        } catch {
          fail(`bad quoted key ${inner}`);
        }
        if (typeof key !== 'string') fail(`bad quoted key ${inner}`);
        segments.push({ kind: 'key', value: key as string });
      } else {
        fail(`unsupported selector [${inner}]`);
      }
    } else if (!expectSeparator && segments.length === 0) {
      // Allow a leading bare key: "meta.generatedAt".
      const start = i;
      while (i < source.length && source[i] !== '.' && source[i] !== '[') i += 1;
      const key = source.slice(start, i);
      segments.push(key === '*' ? { kind: 'wildcard' } : { kind: 'key', value: key });
    } else {
      fail(`unexpected character "${char ?? ''}" at position ${i}`);
    }
    expectSeparator = true;
  }

  return segments;
}

function findClosingBracket(source: string, open: number): number {
  let inString = false;
  for (let i = open + 1; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (char === '\\') i += 1;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === ']') {
      return i;
    }
  }
  return -1;
}

/** Returns true when `segments` matches `pattern` exactly (same length, wildcards allowed). */
export function matchesPattern(
  segments: readonly PathSegment[],
  pattern: readonly PatternSegment[],
): boolean {
  if (segments.length !== pattern.length) return false;
  return pattern.every((part, index) => {
    const segment = segments[index];
    switch (part.kind) {
      case 'wildcard':
        return true;
      case 'key':
        return segment === part.value;
      case 'index':
        return segment === part.value;
    }
  });
}
