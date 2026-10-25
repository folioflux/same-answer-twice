import { createHash } from 'node:crypto';
import type { NormalizeOptions } from './normalize.js';
import { canonicalize } from './normalize.js';

/**
 * Returns a stable SHA-256 hex digest of a value. Two values that are equal after
 * normalization (key order, -0, rounding, ignored paths, ...) always get the same hash.
 */
export function stableHash(value: unknown, options: NormalizeOptions = {}): string {
  return createHash('sha256').update(canonicalize(value, options), 'utf8').digest('hex');
}

/** A short prefix of a hash, handy in human-readable reports. */
export function shortHash(hash: string, length = 12): string {
  return hash.slice(0, length);
}
