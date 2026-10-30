import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { RuntimeSettings } from "../../config/runtime.js";
import type { Database, Scope } from "../../platform/database/database.js";
import { Failure } from "../../platform/failure.js";
import { digest } from "../workspace-access/credentials.js";
import { scanQueue } from "../../workers/queue.js";
import type { Queue } from "../../workers/queue.js";
import { currentJobAccess, jobScope } from "../../workers/events.js";
import { FileStore, maximumFileBytes } from "./store.js";
import { scan } from "./scanner.js";

export interface FileMetadata { id: string; name: string; mediaType: string; bytes: number; state: "pending" | "clean" | "rejected" | "unavailable" | "deleted"; version: number; digest: string; recordId: string }
export const fileColumns = 'id,name,media_type AS "mediaType",bytes,state,version,digest,record_id AS "recordId"';
export interface Upload { operationId: string; name: string; mediaType: string; content: string }

export class Files {
  readonly store: FileStore;
  constructor(readonly database: Database, readonly queue: Queue, readonly settings: RuntimeSettings) { this.store = new FileStore(settings.storagePath); }

  async upload(scope: Scope, recordId: string, input: Upload): Promise<FileMetadata> {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.content)) throw new Failure(400, "INVALID_FILE", "File content must be valid base64.");
    const bytes = Buffer.from(input.content, "base64");
    if (!bytes.length || bytes.length > maximumFileBytes) throw new Failure(413, "FILE_TOO_LARGE", "Choose a nonempty file no larger than 5 MiB.");
    if (input.mediaType === "application/pdf" && !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Failure(400, "INVALID_FILE", "The file does not have a PDF signature.");
    const fileDigest = digest(bytes);
    let written: string | undefined;
    try {
      return await this.database.transaction(scope, async (client) => {
        await client.query("SELECT id FROM tantu.workspaces WHERE id=$1 FOR UPDATE", [scope.workspaceId]);
        if (!(await client.query("SELECT id FROM tantu.records WHERE id=$1 AND tantu.can_access(id,true)", [recordId])).rowCount) throw new Failure(404, "NOT_FOUND", "Record is unavailable.");
        const existing = await client.query<FileMetadata>(`SELECT ${fileColumns} FROM tantu.files WHERE workspace_id=$1 AND owner_id=$2 AND operation_id=$3`, [scope.workspaceId, scope.userId, input.operationId]);
        const prior = existing.rows[0];
        if (prior) {
          if (prior.digest !== fileDigest || prior.name !== input.name || prior.mediaType !== input.mediaType || prior.recordId !== recordId) throw new Failure(409, "OPERATION_CONFLICT", "This operation key was already used for different content.");
          return prior;
        }
        const quota = await client.query("UPDATE tantu.workspaces SET file_bytes=file_bytes+$2,file_count=file_count+1 WHERE id=$1 AND file_bytes+$2<=104857600 AND file_count<1000 RETURNING id", [scope.workspaceId, bytes.length]);
        if (!quota.rowCount) throw new Failure(409, "QUOTA_EXCEEDED", "Workspace file limit reached.");
        const id = randomUUID();
        await this.store.write(id, bytes);
        written = id;
        const result = await client.query<FileMetadata>(`INSERT INTO tantu.files(id,workspace_id,record_id,owner_id,name,media_type,bytes,digest,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${fileColumns}`, [id, scope.workspaceId, recordId, scope.userId, input.name, input.mediaType, bytes.length, fileDigest, input.operationId]);
        await this.queue.enqueue(client, scanQueue, randomUUID(), { ...scope, recordId, fileId: id });
        const metadata = result.rows[0];
        if (!metadata) throw new Error("File metadata was not created.");
        return metadata;
      });
    } catch (error) {
      if (written) await this.store.remove(written);
      throw error;
    }
  }

  signature(scope: Scope, metadata: FileMetadata, expires = Math.floor(Date.now() / 1000) + 60): string {
    const payload = `${metadata.id}.${metadata.version}.${expires}.${scope.userId}`;
    return `${expires}.${createHmac("sha256", this.settings.signingSecret).update(payload).digest("hex")}`;
  }

  verify(scope: Scope, metadata: FileMetadata, token: string): boolean {
    const [rawExpiry, signature] = token.split(".");
    const expiry = Number(rawExpiry);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(expiry) || expiry < now || expiry > now + 60 || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
    const expected = this.signature(scope, metadata, expiry).split(".")[1];
    return expected !== undefined && timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  }

  async process(client: PoolClient, data: unknown): Promise<void> {
    const scope = jobScope(data);
    if (!scope.fileId || !await currentJobAccess(client, scope)) return;
    const result = await client.query<FileMetadata>(`SELECT ${fileColumns} FROM tantu.files WHERE id=$1 AND record_id=$2 FOR UPDATE`, [scope.fileId, scope.recordId]);
    const file = result.rows[0];
    if (!file) return;
    if (file.state === "deleted") {
      await this.store.remove(file.id);
      const removed = await client.query("UPDATE tantu.deletions SET removed_at=now() WHERE file_id=$1 AND removed_at IS NULL RETURNING file_id", [file.id]);
      if (removed.rowCount) await client.query("UPDATE tantu.workspaces SET file_bytes=file_bytes-$2,file_count=file_count-1 WHERE id=$1", [scope.workspaceId, file.bytes]);
      return;
    }
    if (file.state !== "pending" && file.state !== "unavailable") return;
    const bytes = await this.store.read(file.id);
    const verdict = digest(bytes) === file.digest ? await scan(bytes, this.settings) : "rejected";
    await client.query("UPDATE tantu.files SET state=$2,version=version+1 WHERE id=$1", [file.id, verdict]);
  }
}
