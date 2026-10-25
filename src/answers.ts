import { extractNumbers, normalizeText } from './text.js';

/** How raw output (a file or a command's stdout) is turned into an answer to compare. */
export type AnswerMode = 'json' | 'text' | 'numbers';

export const ANSWER_MODES: readonly AnswerMode[] = ['json', 'text', 'numbers'];

/**
 * Parses raw output into an answer:
 *
 * - `json`: the output must be a JSON document.
 * - `text`: the output is compared as normalized text (trimmed, whitespace collapsed).
 * - `numbers`: only the numbers in the output are compared, in order.
 */
export function parseAnswer(raw: string, mode: AnswerMode): unknown {
  const text = raw.startsWith('\uFEFF') ? raw.slice(1) : raw;
  switch (mode) {
    case 'json':
      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new SyntaxError(`Output is not valid JSON: ${reason}`, { cause: error });
      }
    case 'text':
      return normalizeText(text);
    case 'numbers':
      return extractNumbers(text);
  }
}
