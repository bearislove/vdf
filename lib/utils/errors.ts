/**
 * Converts any error value (Error, provider object, string, etc.) into a message
 * at error boundaries so the database and UI always receive a string.
 */
export function toErrorMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
