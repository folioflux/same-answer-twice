import type { Json } from './json.js';
import { isJsonObject, jsonType } from './json.js';
import type { NormalizeOptions } from './normalize.js';
import { canonicalStringify, normalize, roundTo } from './normalize.js';
import type { PathSegment } from './paths.js';
import { formatPath } from './paths.js';

/** Options for comparing two answers. */
export interface CompareOptions extends NormalizeOptions {
  /** Numbers whose absolute difference is at most this value are treated as equal. */
  tolerance?: number;
  /**
   * Numbers whose difference is at most this fraction of the larger absolute value are
   * treated as equal, for example `0.001` for 0.1%.
   */
  relativeTolerance?: number;
}

/**
 * One difference between a left (baseline) and a right (candidate) value.
 *
 * - `changed`: both sides have a value of the same type, but the values differ.
 * - `type`: both sides have a value, but of different JSON types.
 * - `added`: the path exists only on the right.
 * - `removed`: the path exists only on the left.
 */
export type Difference =
  | { kind: 'changed'; path: string; left: Json; right: Json; delta?: number }
  | { kind: 'type'; path: string; left: Json; right: Json }
  | { kind: 'added'; path: string; right: Json }
  | { kind: 'removed'; path: string; left: Json };

/** Compares two values after normalization and lists every difference, in a stable order. */
export function diff(left: unknown, right: unknown, options: CompareOptions = {}): Difference[] {
  validateTolerances(options);
  const out: Difference[] = [];
  diffJson(normalize(left, options), normalize(right, options), [], options, out);
  return out;
}

/** Returns true when two values are equal after normalization and within tolerances. */
export function isEqual(left: unknown, right: unknown, options: CompareOptions = {}): boolean {
  return diff(left, right, options).length === 0;
}

function validateTolerances(options: CompareOptions): void {
  for (const name of ['tolerance', 'relativeTolerance'] as const) {
    const value = options[name];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new RangeError(`${name} must be a finite number >= 0`);
    }
  }
}

/** Returns true when two finite numbers are equal within the configured tolerances. */
export function numbersMatch(left: number, right: number, options: CompareOptions = {}): boolean {
  if (left === right) return true;
  const delta = Math.abs(left - right);
  // A tiny epsilon keeps "0.1 + 0.2 within 0.0000001 of 0.3" style comparisons honest.
  const epsilon = Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
  if (options.tolerance !== undefined && delta <= options.tolerance + epsilon) return true;
  if (options.relativeTolerance !== undefined) {
    const scale = Math.max(Math.abs(left), Math.abs(right));
    if (delta <= options.relativeTolerance * scale + epsilon) return true;
  }
  return false;
}

function diffJson(
  left: Json,
  right: Json,
  path: PathSegment[],
  options: CompareOptions,
  out: Difference[],
): void {
  const leftType = jsonType(left);
  const rightType = jsonType(right);
  if (leftType !== rightType) {
    out.push({ kind: 'type', path: formatPath(path), left, right });
    return;
  }

  if (typeof left === 'number' && typeof right === 'number') {
    if (!numbersMatch(left, right, options)) {
      out.push({
        kind: 'changed',
        path: formatPath(path),
        left,
        right,
        delta: subtract(right, left),
      });
    }
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    diffArrays(left, right, path, options, out);
    return;
  }

  if (isJsonObject(left) && isJsonObject(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const childPath = [...path, key];
      const inLeft = Object.hasOwn(left, key);
      const inRight = Object.hasOwn(right, key);
      if (!inRight) {
        out.push({ kind: 'removed', path: formatPath(childPath), left: left[key] ?? null });
      } else if (!inLeft) {
        out.push({ kind: 'added', path: formatPath(childPath), right: right[key] ?? null });
      } else {
        diffJson(left[key] ?? null, right[key] ?? null, childPath, options, out);
      }
    }
    return;
  }

  if (left !== right) {
    out.push({ kind: 'changed', path: formatPath(path), left, right });
  }
}

/** Above this many element pairs, arrays are compared index by index instead of aligned. */
const MAX_ALIGNMENT_CELLS = 1_000_000;

/**
 * Compares arrays by first aligning elements that are exactly equal (longest common
 * subsequence), so one inserted or removed item is reported once instead of shifting every
 * later index. Unaligned items between anchors are paired up and compared recursively (which
 * applies numeric tolerances); leftovers are reported as removed or added.
 *
 * Paths of removed and paired items use the left (baseline) index; added items use the right
 * (candidate) index.
 */
function diffArrays(
  left: Json[],
  right: Json[],
  path: PathSegment[],
  options: CompareOptions,
  out: Difference[],
): void {
  const pairs = left.length * right.length <= MAX_ALIGNMENT_CELLS ? alignExact(left, right) : [];
  let i = 0;
  let j = 0;
  for (const [anchorLeft, anchorRight] of [...pairs, [left.length, right.length] as const]) {
    while (i < anchorLeft && j < anchorRight) {
      diffJson(left[i] ?? null, right[j] ?? null, [...path, i], options, out);
      i += 1;
      j += 1;
    }
    for (; i < anchorLeft; i += 1) {
      out.push({ kind: 'removed', path: formatPath([...path, i]), left: left[i] ?? null });
    }
    for (; j < anchorRight; j += 1) {
      out.push({ kind: 'added', path: formatPath([...path, j]), right: right[j] ?? null });
    }
    i = anchorLeft + 1;
    j = anchorRight + 1;
  }
}

/** Index pairs of exactly equal elements forming a longest common subsequence. */
function alignExact(left: Json[], right: Json[]): (readonly [number, number])[] {
  const a = left.map(canonicalStringify);
  const b = right.map(canonicalStringify);
  const n = a.length;
  const m = b.length;
  // lengths[i][j] = LCS length of a[i:] and b[j:], stored row-major in a flat array.
  const width = m + 1;
  const lengths = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        a[i] === b[j]
          ? (lengths[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lengths[(i + 1) * width + j] ?? 0, lengths[i * width + j + 1] ?? 0);
    }
  }
  const pairs: (readonly [number, number])[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if ((lengths[(i + 1) * width + j] ?? 0) >= (lengths[i * width + j + 1] ?? 0)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

/**
 * Subtraction that hides binary noise: the result is rounded to the larger number of decimal
 * places of the two inputs, so 2376.59 - 2376.58 reports 0.01 rather than 0.0100000000002.
 */
function subtract(right: number, left: number): number {
  const decimals = Math.min(15, Math.max(decimalPlaces(left), decimalPlaces(right)));
  return roundTo(right - left, decimals);
}

function decimalPlaces(value: number): number {
  const text = String(value);
  const exponent = /e([+-]\d+)$/u.exec(text);
  const [mantissa = text] = text.split('e');
  const fraction = mantissa.split('.')[1]?.length ?? 0;
  return Math.max(0, fraction - (exponent ? Number(exponent[1]) : 0));
}
