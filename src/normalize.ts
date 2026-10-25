import type { Json } from './json.js';
import { formatPath, matchesPattern, parsePathPattern } from './paths.js';
import type { PathSegment, PatternSegment } from './paths.js';

/** Options that control how answers are normalized before they are hashed or compared. */
export interface NormalizeOptions {
  /**
   * Round every number to this many decimal places (half away from zero).
   * Leave unset to compare numbers exactly.
   */
  precision?: number;
  /** Trim strings and collapse runs of whitespace into a single space. */
  normalizeWhitespace?: boolean;
  /** Compare strings case-insensitively (strings are lower-cased). */
  ignoreCase?: boolean;
  /** Sort every array so that element order does not matter. */
  ignoreArrayOrder?: boolean;
  /**
   * Paths to drop before comparing, for example `$.meta.generatedAt` or `$.rows[*].id`.
   * `*` matches any single key or array index.
   */
  ignorePaths?: readonly string[];
}

interface Context {
  readonly options: NormalizeOptions;
  readonly ignore: readonly PatternSegment[][];
  readonly seen: Set<object>;
}

/**
 * Converts any value into a plain JSON value with the given normalization applied.
 *
 * - Object keys are sorted; `undefined`, functions and symbols inside objects are dropped.
 * - `-0` becomes `0`; `NaN` and `±Infinity` become `{ "$number": "NaN" }` style markers.
 * - `bigint` becomes `{ "$bigint": "123" }`; `Date` becomes its ISO string.
 * - `Map` becomes an object (keys stringified) and `Set` becomes an array.
 * - Circular references throw a `TypeError`.
 */
export function normalize(value: unknown, options: NormalizeOptions = {}): Json {
  validateOptions(options);
  const context: Context = {
    options,
    ignore: (options.ignorePaths ?? []).map((pattern) => parsePathPattern(pattern)),
    seen: new Set(),
  };
  return normalizeValue(value, [], context) ?? null;
}

function validateOptions(options: NormalizeOptions): void {
  const { precision } = options;
  if (
    precision !== undefined &&
    (!Number.isInteger(precision) || precision < 0 || precision > 15)
  ) {
    throw new RangeError('precision must be an integer between 0 and 15');
  }
}

function isIgnored(path: readonly PathSegment[], context: Context): boolean {
  return context.ignore.some((pattern) => matchesPattern(path, pattern));
}

/** Returns `undefined` for values that JSON would drop (undefined, functions, symbols). */
function normalizeValue(value: unknown, path: PathSegment[], context: Context): Json | undefined {
  switch (typeof value) {
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined;
    case 'boolean':
      return value;
    case 'string':
      return normalizeString(value, context.options);
    case 'number':
      return normalizeNumber(value, context.options);
    case 'bigint':
      return { $bigint: value.toString() };
    case 'object':
      break;
  }
  if (value === null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? { $date: 'Invalid Date' } : value.toISOString();
  }

  if (context.seen.has(value)) {
    throw new TypeError(`Cannot normalize a circular reference at ${formatPath(path)}`);
  }
  context.seen.add(value);
  try {
    if (Array.isArray(value) || value instanceof Set) {
      return normalizeArray([...(value as Iterable<unknown>)], path, context);
    }
    const entries: [string, unknown][] =
      value instanceof Map
        ? [...(value as Map<unknown, unknown>).entries()].map(([k, v]) => [String(k), v])
        : Object.entries(value);
    return normalizeObject(entries, path, context);
  } finally {
    context.seen.delete(value);
  }
}

function normalizeArray(items: unknown[], path: PathSegment[], context: Context): Json[] {
  const out: Json[] = [];
  items.forEach((item, index) => {
    const childPath = [...path, index];
    if (isIgnored(childPath, context)) return;
    // Like JSON.stringify, values that cannot be represented become null inside arrays.
    out.push(normalizeValue(item, childPath, context) ?? null);
  });
  if (context.options.ignoreArrayOrder) {
    const keyed = out.map((item) => [canonicalStringify(item), item] as const);
    keyed.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return keyed.map(([, item]) => item);
  }
  return out;
}

function normalizeObject(
  entries: [string, unknown][],
  path: PathSegment[],
  context: Context,
): { [key: string]: Json } {
  const out: { [key: string]: Json } = {};
  const sorted = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [key, item] of sorted) {
    const childPath = [...path, key];
    if (isIgnored(childPath, context)) continue;
    const normalized = normalizeValue(item, childPath, context);
    if (normalized !== undefined) out[key] = normalized;
  }
  return out;
}

function normalizeString(value: string, options: NormalizeOptions): string {
  let out = value;
  if (options.normalizeWhitespace) out = out.trim().replace(/\s+/gu, ' ');
  if (options.ignoreCase) out = out.toLowerCase();
  return out;
}

function normalizeNumber(value: number, options: NormalizeOptions): Json {
  if (Number.isNaN(value)) return { $number: 'NaN' };
  if (value === Infinity) return { $number: 'Infinity' };
  if (value === -Infinity) return { $number: '-Infinity' };
  const rounded = options.precision === undefined ? value : roundTo(value, options.precision);
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Rounds half away from zero to `decimals` places using decimal exponent shifting, so that
 * values such as 1.005 round to 1.01 rather than suffering from binary floating point error.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  // Numbers this large have no fractional digits left to round.
  if (Math.abs(value) >= 1e15) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const text = String(abs);
  let rounded: number;
  if (text.includes('e')) {
    const factor = 10 ** decimals;
    rounded = Math.round(abs * factor) / factor;
  } else {
    rounded = Number(`${String(Math.round(Number(`${text}e${decimals}`)))}e-${decimals}`);
  }
  const result = sign * rounded;
  return Object.is(result, -0) ? 0 : result;
}

/**
 * Serializes an already-normalized JSON value with sorted object keys and no whitespace.
 * Equal values always produce the same string.
 */
export function canonicalStringify(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key] ?? null)}`)
    .join(',')}}`;
}

/** Normalizes a value and returns its canonical JSON string. */
export function canonicalize(value: unknown, options: NormalizeOptions = {}): string {
  return canonicalStringify(normalize(value, options));
}
