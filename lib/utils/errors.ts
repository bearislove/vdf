/**
 * Ép mọi giá trị lỗi (Error, object provider trả về, string...) thành message string —
 * dùng ở ranh giới nhận lỗi (catch, parse response) để DB/UI luôn nhận string.
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
