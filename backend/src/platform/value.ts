export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid object value.");
  return { ...value };
}
export function string(value: unknown): string { if (typeof value !== "string") throw new Error("Invalid text value."); return value; }
export function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error("Invalid list value."); return value; }
