import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";

const root = new URL("../../", import.meta.url);
const workingDirectory = new URL("archive/qualification/", root);
const artifacts = new URL("discovery/.artifacts/archive/", root);
const go = process.env.TANTU_GO_BINARY || "go";
await mkdir(artifacts, { recursive: true });
const environment = {
  ...process.env,
  GOCACHE: process.env.GOCACHE || join(tmpdir(), "tantu-l0-go-cache"),
  GOPATH: process.env.GOPATH || join(tmpdir(), "tantu-l0-go-path"),
};

function execute(arguments_, filename, executable = go) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { cwd: workingDirectory, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    const deadline = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("error", (error) => { clearTimeout(deadline); reject(error); });
    child.on("close", async (code) => {
      clearTimeout(deadline);
      try {
        await writeFile(new URL(filename, artifacts), output);
        if (code !== 0) { reject(new Error(`Archive command failed (${code}): ${arguments_.join(" ")}\n${output}`)); return; }
        resolve(output);
      } catch (error) { reject(error); }
    });
  });
}

try {
  const version = await execute(["version"], "toolchain.txt");
  const formatter = dirname(go) === "." ? "gofmt" : join(dirname(go), "gofmt");
  const formatting = await execute(["-l", "qualification.go", "qualification_test.go"], "format.txt", formatter);
  if (formatting.trim()) throw new Error("Go formatting differs from gofmt.");
  await execute(["vet", "./..."], "vet.txt");
  const tests = await execute(["test", "-mod=readonly", "-json", "-race", "./..."], "tests.jsonl");
  await execute(["test", "-mod=readonly", "-run=^$", "-fuzz=FuzzOracleParity", "-fuzztime=5s", "-parallel=2"], "fuzz.txt");
  await execute(["test", "-mod=readonly", "-run=^$", "-bench=Benchmark(Indexed|Sidecar)Search", "-benchtime=20x", "-benchmem"], "benchmark.txt");
  const events = tests.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  const passedTests = events.filter((event) => event.Action === "pass" && event.Test).length;
  const moduleText = await readFile(new URL("go.mod", workingDirectory), "utf8");
  if (!moduleText.includes("github.com/minio/minlz v1.2.0")) throw new Error("Unexpected MinLZ pin.");
  await writeFile(new URL("report.json", artifacts), JSON.stringify({ result: "passed", toolchain: version.trim(), minlz: "v1.2.0", passedTests, race: "passed", vet: "passed", boundedFuzzSeconds: 5, benchmarkIterations: 20, productionEnabled: false, scope: "synthetic local archive qualification; not production security or corpus suitability" }, null, 2) + "\n");
  process.stdout.write(`Archive qualification passed. Evidence: ${fileURLToPath(artifacts)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Archive qualification failed."}\nSet TANTU_GO_BINARY to an installed Go 1.24+ binary if Go is not on PATH.\n`);
  process.exitCode = 1;
}
