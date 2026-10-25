/** A JSON-safe value after normalization. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Type guard for plain JSON objects produced by `normalize`. */
export function isJsonObject(value: Json): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Describes the JSON type of a value, used in diff reports. */
export function jsonType(
  value: Json,
): 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    default:
      return 'object';
  }
}
