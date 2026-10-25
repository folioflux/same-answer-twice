import { describe, expect, it } from 'vitest';
import { shortHash, stableHash } from '../src/index.js';

describe('stableHash', () => {
  it('is a sha256 hex digest of the canonical form', () => {
    // sha256 of the string '{"a":1,"b":2}'
    expect(stableHash({ b: 2, a: 1 })).toBe(
      '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777',
    );
  });

  it('is independent of key order and -0', () => {
    expect(stableHash({ x: -0, y: [1, { b: 1, a: 2 }] })).toBe(
      stableHash({ y: [1, { a: 2, b: 1 }], x: 0 }),
    );
  });

  it('changes when a value changes', () => {
    expect(stableHash({ total: 100 })).not.toBe(stableHash({ total: 100.01 }));
  });

  it('respects normalization options', () => {
    expect(stableHash({ total: 100.001 }, { precision: 2 })).toBe(stableHash({ total: 100 }));
  });

  it('does not confuse strings and numbers', () => {
    expect(stableHash('1')).not.toBe(stableHash(1));
  });

  it('shortens hashes', () => {
    expect(shortHash('abcdef0123456789')).toBe('abcdef012345');
    expect(shortHash('abcdef0123456789', 4)).toBe('abcd');
  });
});
