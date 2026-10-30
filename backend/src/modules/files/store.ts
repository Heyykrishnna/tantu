import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";

export const maximumFileBytes = 5 * 1024 * 1024;

export class FileStore {
  constructor(readonly directory: string) { }
  path(id: string): string {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid storage identity.");
    return join(this.directory, id);
  }
  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Storage requires a private regular directory.");
    await chmod(this.directory, 0o700);
  }
  async write(id: string, bytes: Buffer): Promise<void> {
    if (!bytes.length || bytes.length > maximumFileBytes) throw new Error("File size exceeds storage bounds.");
    const file = await open(this.path(id), "wx", 0o600);
    try { await file.writeFile(bytes); await file.sync(); }
    finally { await file.close(); }
    const directory = await open(this.directory, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
  async read(id: string): Promise<Buffer> {
    const file = await open(this.path(id), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > maximumFileBytes) throw new Error("Stored file is invalid.");
      return await file.readFile();
    } finally { await file.close(); }
  }
  async remove(id: string): Promise<void> {
    try { await unlink(this.path(id)); }
    catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error; }
  }
}
