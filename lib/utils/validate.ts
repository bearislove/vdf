// Input validation utilities

export function isNonEmpty(v: string | undefined | null): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function isValidUrl(v: string): boolean {
  try { new URL(v); return true; } catch { return false; }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function isMultipleOf(value: number, factor: number): boolean {
  return value % factor === 0;
}

export function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

export function isImageFile(filename: string): boolean {
  return /\.(png|jpg|jpeg|webp)$/i.test(filename);
}

export function isVideoFile(filename: string): boolean {
  return /\.(mp4|webm|webp|mov)$/i.test(filename);
}

export function isAudioFile(filename: string): boolean {
  return /\.(wav|mp3|m4a|ogg)$/i.test(filename);
}

export function validatePrompt(prompt: string): string | null {
  if (!isNonEmpty(prompt)) return "Prompt is required";
  if (prompt.length < 5) return "Prompt is too short (minimum 5 characters)";
  if (prompt.length > 2000) return "Prompt is too long (maximum 2000 characters)";
  return null;
}
