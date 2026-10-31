import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "pg";

const execute = promisify(execFile);

async function binary(name: string): Promise<string> {
  if (process.env.PG_BIN) return join(process.env.PG_BIN, name);
  try {
    await execute(name, ["--version"]);
    return name;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    const { stdout } = await execute("pg_config", ["--bindir"]);
    return join(stdout.trim(), name);
  }
}

export async function startPostgresFixture() {
  const control = await binary("pg_ctl");
  const initialize = await binary("initdb");
  const { stdout: version } = await execute(control, ["--version"]);
  const major = Number(/\b(\d+)\./.exec(version)?.[1]);
  if (!Number.isInteger(major) || major < 16) throw new Error("PostgreSQL 16 or newer is required for the isolated fixture.");
  const directory = await mkdtemp(join(process.platform === "darwin" ? "/private/tmp" : tmpdir(), "tantu-l0-pg-"));
  const data = join(directory, "data");
  const socket = join(directory, "socket");
  let running = false;
  const port = 54000 + Math.floor(Math.random() * 5000);
  const configuration = { host: socket, port, user: "l0_owner", database: "postgres" };

  async function startServer(): Promise<void> {
    await execute(control, ["-D", data, "-l", join(directory, "postgres.log"), "-o", `-k ${socket} -p ${port} -c listen_addresses='' -c fsync=on -c shared_buffers=32MB -c max_connections=24`, "-w", "start"]);
    running = true;
  }

  async function stop(): Promise<void> {
    if (running) {
      await execute(control, ["-D", data, "-m", "fast", "-w", "stop"]);
      running = false;
    }
    await rm(directory, { recursive: true, force: true });
  }

  try {
    await chmod(directory, 0o700);
    await mkdir(socket, { mode: 0o700 });
    await execute(initialize, ["-D", data, "--auth-local=trust", "--auth-host=reject", "--username=l0_owner", "--encoding=UTF8", "--no-locale"]);
    await startServer();
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    configuration,
    version: version.trim(),
    async connect() {
      const client = new Client({ ...configuration, statement_timeout: 10_000, connectionTimeoutMillis: 5000 });
      await client.connect();
      return client;
    },
    async crashAndRestart() {
      await execute(control, ["-D", data, "-m", "immediate", "-w", "stop"]);
      running = false;
      await startServer();
    },
    stop,
  };
}
