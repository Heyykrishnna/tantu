import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";
import ts from "typescript";

const source = await readFile(new URL("../src/modules/work-management/contracts.ts", import.meta.url), "utf8");
const file = ts.createSourceFile("contracts.ts", source, ts.ScriptTarget.Latest, true);
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const names = new Set(["Document", "RecordInput", "CanonicalRecord"]);
const types = file.statements.filter((node) => ts.isInterfaceDeclaration(node) && names.has(node.name.text));
if (types.length !== names.size) throw new Error("Canonical contract interfaces are missing.");
const output = types.map((node) => printer.printNode(ts.EmitHint.Unspecified, node, file)).join("\n\n") + "\n";
const target = new URL("../../frontend/lib/contracts.ts", import.meta.url);
if (process.argv.includes("--check")) {
  if (await readFile(target, "utf8") !== output) throw new Error("Frontend contracts are stale. Run npm --prefix backend run contracts:types.");
} else await writeFile(target, output);
