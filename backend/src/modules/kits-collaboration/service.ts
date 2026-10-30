import type { PoolClient } from "pg";
import { Failure } from "../../platform/failure.js";

export interface KitManifest {
  schemas?: Array<{ name: string; properties: Array<{ name: string; type: string }> }>;
  templates?: Array<{ title: string; kind: string; bodySnippet?: string }>;
  views?: Array<{ name: string; target: string; filterJson?: Record<string, unknown> }>;
  rules?: Array<{ name: string; trigger: string; action: string }>;
}

export interface WorkspaceKitRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  version: string;
  manifest: KitManifest;
  authorId: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  isInstalled?: boolean;
}

export interface KitConflictItem {
  type: "schema" | "view" | "rule";
  identifier: string;
  existingValue: string;
  incomingValue: string;
  action: "preserve_local" | "replace";
}

export interface KitConflictPreview {
  kitId: string;
  kitName: string;
  conflicts: KitConflictItem[];
  canInstall: boolean;
  summary: string;
}

export interface FormulaEvaluationResult {
  expression: string;
  result: string | number | boolean | null;
  error: string | null;
  evaluatedType: "number" | "string" | "boolean" | "null";
}

export interface SyncedBlockRecord {
  id: string;
  workspaceId: string;
  canonicalEntityId: string;
  entityType: "page" | "task";
  content: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function createWorkspaceKit(
  client: PoolClient,
  workspaceId: string,
  authorId: string,
  input: {
    name: string;
    description?: string;
    version?: string;
    manifest: KitManifest;
  }
): Promise<WorkspaceKitRecord> {
  if (!input.name || input.name.trim().length === 0 || input.name.length > 100) {
    throw new Failure(400, "INVALID_INPUT", "Kit name must be between 1 and 100 characters.");
  }

  const result = await client.query(
    `INSERT INTO tantu.workspace_kits(
       workspace_id, name, description, version, manifest, author_id, is_published
     ) VALUES($1, $2, $3, $4, $5, $6, true)
     RETURNING
       id, workspace_id AS "workspaceId", name, description, version,
       manifest, author_id AS "authorId", is_published AS "isPublished",
       created_at::text AS "createdAt", updated_at::text AS "updatedAt"`,
    [
      workspaceId,
      input.name.trim(),
      input.description ?? "",
      input.version ?? "1.0.0",
      JSON.stringify(input.manifest ?? {}),
      authorId
    ]
  );

  return result.rows[0] as WorkspaceKitRecord;
}

export async function listWorkspaceKits(
  client: PoolClient,
  workspaceId: string
): Promise<WorkspaceKitRecord[]> {
  const result = await client.query(
    `SELECT k.id, k.workspace_id AS "workspaceId", k.name, k.description, k.version,
            k.manifest, k.author_id AS "authorId", k.is_published AS "isPublished",
            k.created_at::text AS "createdAt", k.updated_at::text AS "updatedAt",
            (ki.id IS NOT NULL) AS "isInstalled"
     FROM tantu.workspace_kits k
     LEFT JOIN tantu.workspace_kit_installations ki
       ON ki.kit_id = k.id AND ki.workspace_id = $1
     WHERE k.workspace_id = $1 OR k.is_published = true
     ORDER BY k.created_at DESC`,
    [workspaceId]
  );

  return result.rows as WorkspaceKitRecord[];
}

export async function previewKitInstallation(
  client: PoolClient,
  workspaceId: string,
  kitId: string
): Promise<KitConflictPreview> {
  const kitResult = await client.query(
    `SELECT id, name, manifest FROM tantu.workspace_kits WHERE id = $1`,
    [kitId]
  );

  if (kitResult.rows.length === 0) {
    throw new Failure(404, "NOT_FOUND", "Workspace kit not found.");
  }

  const kit = kitResult.rows[0] as { id: string; name: string; manifest: KitManifest };
  const conflicts: KitConflictItem[] = [];

  const existingCollections = await client.query(
    `SELECT name FROM tantu.collections WHERE workspace_id = $1`,
    [workspaceId]
  );
  const existingNames = new Set(existingCollections.rows.map((r: { name: string }) => r.name));

  for (const schema of kit.manifest.schemas ?? []) {
    if (existingNames.has(schema.name)) {
      conflicts.push({
        type: "schema",
        identifier: schema.name,
        existingValue: "Existing collection schema",
        incomingValue: `Incoming kit schema with ${schema.properties.length} properties`,
        action: "preserve_local"
      });
    }
  }

  return {
    kitId: kit.id,
    kitName: kit.name,
    conflicts,
    canInstall: true,
    summary:
      conflicts.length === 0
        ? "Clean installation: no schema or view conflicts detected."
        : `${conflicts.length} conflict(s) detected. Local customizations will be preserved.`
  };
}

export async function installWorkspaceKit(
  client: PoolClient,
  workspaceId: string,
  installerId: string,
  kitId: string,
  choices: Record<string, "preserve_local" | "replace"> = {}
): Promise<{ installed: boolean; appliedCount: number }> {
  const kitResult = await client.query(
    `SELECT id, version, manifest FROM tantu.workspace_kits WHERE id = $1`,
    [kitId]
  );

  if (kitResult.rows.length === 0) {
    throw new Failure(404, "NOT_FOUND", "Workspace kit not found.");
  }

  const kit = kitResult.rows[0] as { id: string; version: string; manifest: KitManifest };
  let appliedCount = 0;

  for (const schema of kit.manifest.schemas ?? []) {
    const choice = choices[schema.name] ?? "preserve_local";
    if (choice === "replace") {
      await client.query(
        `INSERT INTO tantu.collections(workspace_id, name, schema_json)
         VALUES($1, $2, $3)
         ON CONFLICT (workspace_id, name)
         DO UPDATE SET schema_json = EXCLUDED.schema_json`,
        [workspaceId, schema.name, JSON.stringify(schema.properties)]
      );
      appliedCount++;
    } else {
      const exists = await client.query(
        `SELECT id FROM tantu.collections WHERE workspace_id = $1 AND name = $2`,
        [workspaceId, schema.name]
      );
      if (exists.rows.length === 0) {
        await client.query(
          `INSERT INTO tantu.collections(workspace_id, name, schema_json)
           VALUES($1, $2, $3)`,
          [workspaceId, schema.name, JSON.stringify(schema.properties)]
        );
        appliedCount++;
      }
    }
  }

  await client.query(
    `INSERT INTO tantu.workspace_kit_installations(
       workspace_id, kit_id, installed_version, applied_manifest, installed_by
     ) VALUES($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, kit_id)
     DO UPDATE SET installed_version = EXCLUDED.installed_version, applied_manifest = EXCLUDED.applied_manifest, installed_at = now()`,
    [workspaceId, kit.id, kit.version, JSON.stringify(kit.manifest), installerId]
  );

  return { installed: true, appliedCount };
}

export function evaluateFormula(
  expression: string,
  context: Record<string, unknown> = {}
): FormulaEvaluationResult {
  const trimmed = expression.trim();
  if (!trimmed) {
    return { expression, result: null, error: null, evaluatedType: "null" };
  }

  try {
    const upper = trimmed.toUpperCase();

    if (upper.startsWith("CONCAT(") && trimmed.endsWith(")")) {
      const inner = trimmed.slice(7, -1);
      const parts = splitFormulaArgs(inner);
      const evaluated = parts.map((p) => {
        const val = resolveFormulaToken(p.trim(), context);
        return String(val ?? "");
      });
      const res = evaluated.join("");
      return { expression, result: res, error: null, evaluatedType: "string" };
    }

    if (upper.startsWith("LOWER(") && trimmed.endsWith(")")) {
      const inner = trimmed.slice(6, -1);
      const val = resolveFormulaToken(inner.trim(), context);
      const res = String(val ?? "").toLowerCase();
      return { expression, result: res, error: null, evaluatedType: "string" };
    }

    if (upper.startsWith("UPPER(") && trimmed.endsWith(")")) {
      const inner = trimmed.slice(6, -1);
      const val = resolveFormulaToken(inner.trim(), context);
      const res = String(val ?? "").toUpperCase();
      return { expression, result: res, error: null, evaluatedType: "string" };
    }

    if (upper.startsWith("TRIM(") && trimmed.endsWith(")")) {
      const inner = trimmed.slice(5, -1);
      const val = resolveFormulaToken(inner.trim(), context);
      const res = String(val ?? "").trim();
      return { expression, result: res, error: null, evaluatedType: "string" };
    }

    if (upper.startsWith("IF(") && trimmed.endsWith(")")) {
      const inner = trimmed.slice(3, -1);
      const parts = splitFormulaArgs(inner);
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
        throw new Error("IF requires exactly 3 arguments: condition, true_val, false_val");
      }
      const condVal = resolveFormulaToken(parts[0].trim(), context);
      const chosen = condVal ? parts[1].trim() : parts[2].trim();
      const res = resolveFormulaToken(chosen, context);
      return {
        expression,
        result: res as string | number | boolean | null,
        error: null,
        evaluatedType: typeof res === "number" ? "number" : typeof res === "boolean" ? "boolean" : "string"
      };
    }

    if (upper.startsWith("ROUND(") && trimmed.endsWith(")")) {
      const inner = trimmed.slice(6, -1);
      const parts = splitFormulaArgs(inner);
      if (!parts[0]) throw new Error("ROUND requires at least 1 argument");
      const num = Number(resolveFormulaToken(parts[0].trim(), context));
      const decimals = parts[1] ? Number(resolveFormulaToken(parts[1].trim(), context)) : 0;
      if (isNaN(num)) throw new Error("ROUND requires numeric input");
      const factor = Math.pow(10, decimals);
      const res = Math.round(num * factor) / factor;
      return { expression, result: res, error: null, evaluatedType: "number" };
    }

    if (upper.startsWith("DAYS_BETWEEN(") && trimmed.endsWith(")")) {
      const inner = trimmed.slice(13, -1);
      const parts = splitFormulaArgs(inner);
      if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("DAYS_BETWEEN requires 2 dates");
      const d1 = new Date(String(resolveFormulaToken(parts[0].trim(), context)));
      const d2 = new Date(String(resolveFormulaToken(parts[1].trim(), context)));
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) throw new Error("Invalid date argument");
      const diffDays = Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      return { expression, result: diffDays, error: null, evaluatedType: "number" };
    }

    const simpleMathMatch = trimmed.match(/^([a-zA-Z0-9_."'\s]+)\s*([+\-*/%])\s*([a-zA-Z0-9_."'\s]+)$/);
    if (simpleMathMatch && simpleMathMatch[1] && simpleMathMatch[2] && simpleMathMatch[3]) {
      const left = Number(resolveFormulaToken(simpleMathMatch[1].trim(), context));
      const op = simpleMathMatch[2];
      const right = Number(resolveFormulaToken(simpleMathMatch[3].trim(), context));
      if (!isNaN(left) && !isNaN(right)) {
        let res: number;
        switch (op) {
          case "+":
            res = left + right;
            break;
          case "-":
            res = left - right;
            break;
          case "*":
            res = left * right;
            break;
          case "/":
            if (right === 0) throw new Error("Division by zero");
            res = left / right;
            break;
          case "%":
            res = left % right;
            break;
          default:
            throw new Error(`Unsupported operator ${op}`);
        }
        return { expression, result: Number(res.toFixed(4)), error: null, evaluatedType: "number" };
      }
    }

    const literal = resolveFormulaToken(trimmed, context);
    return {
      expression,
      result: literal as string | number | boolean | null,
      error: null,
      evaluatedType: typeof literal === "number" ? "number" : typeof literal === "boolean" ? "boolean" : literal === null ? "null" : "string"
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Formula evaluation failed";
    return { expression, result: null, error: errorMsg, evaluatedType: "null" };
  }
}

function resolveFormulaToken(token: string, context: Record<string, unknown>): unknown {
  if (token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1);
  }
  if (token.startsWith("'") && token.endsWith("'")) {
    return token.slice(1, -1);
  }
  if (token === "true" || token === "TRUE") return true;
  if (token === "false" || token === "FALSE") return false;
  if (token === "null" || token === "NULL") return null;
  if (!isNaN(Number(token))) return Number(token);

  if (Object.prototype.hasOwnProperty.call(context, token)) {
    return context[token];
  }
  return null;
}

function splitFormulaArgs(argsStr: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];
    if ((char === '"' || char === "'") && (i === 0 || argsStr[i - 1] !== "\\")) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
      }
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result;
}

export async function upsertSyncedBlock(
  client: PoolClient,
  workspaceId: string,
  canonicalEntityId: string,
  entityType: "page" | "task",
  content: Record<string, unknown>
): Promise<SyncedBlockRecord> {
  const result = await client.query(
    `INSERT INTO tantu.synced_blocks(
       workspace_id, canonical_entity_id, entity_type, content, version
     ) VALUES($1, $2, $3, $4, 1)
     RETURNING
       id, workspace_id AS "workspaceId", canonical_entity_id AS "canonicalEntityId",
       entity_type AS "entityType", content, version,
       created_at::text AS "createdAt", updated_at::text AS "updatedAt"`,
    [workspaceId, canonicalEntityId, entityType, JSON.stringify(content)]
  );
  return result.rows[0] as SyncedBlockRecord;
}

export async function getSyncedBlock(
  client: PoolClient,
  workspaceId: string,
  blockId: string
): Promise<SyncedBlockRecord | null> {
  const result = await client.query(
    `SELECT id, workspace_id AS "workspaceId", canonical_entity_id AS "canonicalEntityId",
            entity_type AS "entityType", content, version,
            created_at::text AS "createdAt", updated_at::text AS "updatedAt"
     FROM tantu.synced_blocks
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, blockId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0] as SyncedBlockRecord;
}
