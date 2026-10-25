/**
 * Helpers for answers that are free text rather than structured data.
 */

/**
 * Matches numbers such as `42`, `-3.5`, `1,234.56`, `−7` (Unicode minus) and `.5`.
 * A sign only counts when it is not glued to a preceding word or digit, so the date
 * `2026-10-25` reads as 2026, 10 and 25 rather than 2026, -10 and -25.
 */
const NUMBER =
  /(?<![\p{L}\p{N}_.])([-−+]?)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?![\p{N}])/gu;

/**
 * Extracts every number from a piece of text, in order. Thousands separators (`,`) are
 * removed and `.` is the decimal separator. Percent signs and currency symbols are ignored,
 * so `"12.5%"` gives `12.5` and `"$1,200"` gives `1200`.
 */
export function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const sign = match[1] === '-' || match[1] === '−' ? -1 : 1;
    const digits = (match[2] ?? '').replaceAll(',', '');
    const value = sign * Number(digits);
    if (Number.isFinite(value)) numbers.push(Object.is(value, -0) ? 0 : value);
  }
  return numbers;
}

/** Trims text, collapses whitespace and normalizes line endings and Unicode (NFC). */
export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(/\r\n?/gu, '\n').trim().replace(/\s+/gu, ' ');
}
