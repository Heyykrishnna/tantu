import { Failure } from "../../platform/failure.js";
import { array, object, string } from "../../platform/value.js";

export interface Property { id: string; name: string; type: "text" | "number" | "boolean" | "date" | "select" | "formula"; options: string[]; formula: { operator: "add" | "subtract" | "multiply" | "divide"; left: string; right: string } | null }
export function properties(value: unknown): Property[] {
  const entries = array(value); if (entries.length > 30) throw new Failure(400, "INVALID_SCHEMA", "Collections support at most thirty properties.");
  const result = entries.map((value): Property => {
    const item = object(value); const type = ["text", "number", "boolean", "date", "select", "formula"].find((type) => type === item.type);
    if (!type || !(type === "text" || type === "number" || type === "boolean" || type === "date" || type === "select" || type === "formula")) throw new Failure(400, "UNSUPPORTED_TYPE", "This property type is unsupported.");
    const options = array(item.options ?? []).map(string); const id = string(item.id); const name = string(item.name);
    if (!/^[a-f0-9-]{36}$/i.test(id) || !name.trim() || name.length > 100 || options.length > 20 || options.some((option) => !option || option.length > 100) || new Set(options).size !== options.length) throw new Failure(400, "INVALID_SCHEMA", "Property names, identifiers or options are invalid.");
    let formula: Property["formula"] = null;
    if (type === "formula") {
      const expression = object(item.formula); const operator = ["add", "subtract", "multiply", "divide"].find((operator) => operator === expression.operator);
      if (!operator || !(operator === "add" || operator === "subtract" || operator === "multiply" || operator === "divide")) throw new Failure(400, "INVALID_FORMULA", "Choose an explicitly supported arithmetic operator.");
      formula = { operator, left: string(expression.left), right: string(expression.right) };
    } else if (item.formula !== undefined && item.formula !== null) throw new Failure(400, "INVALID_FORMULA", "Only formula properties can define arithmetic.");
    return { id, name: name.trim(), type, options, formula };
  });
  if (new Set(result.map((property) => property.id)).size !== result.length || new Set(result.map((property) => property.name.toLowerCase())).size !== result.length) throw new Failure(400, "INVALID_SCHEMA", "Property identifiers and names must be unique.");
  const visited = new Set<string>();
  const visit = (id: string, seen: Set<string>): void => {
    if (visited.has(id)) return;
    const property = result.find((entry) => entry.id === id);
    if (!property || !["number", "formula"].includes(property.type) || seen.has(id)) throw new Failure(400, "INVALID_FORMULA", "Formula references must be existing numeric properties without cycles.");
    if (property.formula) { const next = new Set(seen).add(id); visit(property.formula.left, next); visit(property.formula.right, next); }
    visited.add(id);
  };
  for (const property of result) if (property.formula) visit(property.id, new Set());
  return result;
}
export function valueIssue(property: Property, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (property.type === "text") return typeof value === "string" && value.length <= 4000 ? null : "Text must contain at most 4,000 characters.";
  if (property.type === "number") return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12 ? null : "A finite number within ±10^12 is required.";
  if (property.type === "boolean") return typeof value === "boolean" ? null : "A boolean is required.";
  if (property.type === "date") return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? null : "Use an existing date in YYYY-MM-DD form.";
  if (property.type === "select") return typeof value === "string" && property.options.includes(value) ? null : "Choose an option in the current schema.";
  return "Formula values are computed and cannot be supplied.";
}
export function evaluate(definitions: Property[], values: Record<string, unknown>): { values: Record<string, unknown>; repairs: { propertyId: string; message: string }[] } {
  const repairs: { propertyId: string; message: string }[] = []; const output: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(values)) {
    const property = definitions.find((entry) => entry.id === id); const issue = property ? valueIssue(property, value) : "Property was removed; its stored value is preserved for repair.";
    if (issue) repairs.push({ propertyId: id, message: issue }); else output[id] = value;
  }
  const computed = new Map<string, number | null>();
  const compute = (property: Property, depth = 0): number | null => {
    if (computed.has(property.id)) return computed.get(property.id) ?? null;
    if (depth > 30) return null;
    if (!property.formula) { const value = output[property.id]; return typeof value === "number" ? value : null; }
    const left = definitions.find((entry) => entry.id === property.formula?.left); const right = definitions.find((entry) => entry.id === property.formula?.right);
    if (!left || !right) return null; const a = compute(left, depth + 1); const b = compute(right, depth + 1); if (a === null || b === null) return null;
    const operator = property.formula.operator; const value = operator === "add" ? a + b : operator === "subtract" ? a - b : operator === "multiply" ? a * b : b === 0 ? NaN : a / b;
    const result = Number.isFinite(value) ? value : null; computed.set(property.id, result); return result;
  };
  for (const property of definitions) if (property.formula) { output[property.id] = compute(property); if (output[property.id] === null) repairs.push({ propertyId: property.id, message: "Formula inputs are missing, invalid or divide by zero." }); }
  return { values: output, repairs };
}
