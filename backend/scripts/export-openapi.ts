import { readFile, writeFile } from "node:fs/promises";
import type { RouteOptions } from "fastify";
import { createApp } from "../src/app.js";
import { readEnvironment } from "../src/config/environment.js";
import { Database } from "../src/platform/database/database.js";

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return { ...value };
}
const paths: Record<string, Record<string, unknown>> = {};
function capture(options: RouteOptions) {
  if (!options.url.startsWith("/api/v1")) return;
  const methods = Array.isArray(options.method) ? options.method : [options.method];
  const path = options.url.replace(/:([a-zA-Z]+)/g, "{$1}");
  for (const method of methods) {
    if (method === "HEAD") continue;
    const schema = options.schema ?? {};
    const parameters: object[] = [];
    for (const [location, definition] of [["path", schema.params], ["query", schema.querystring]] as const) {
      const parsed = object(definition);
      const required = Array.isArray(parsed.required) ? parsed.required : [];
      for (const [name, value] of Object.entries(object(parsed.properties))) parameters.push({ name, in: location, required: location === "path" || required.includes(name), schema: value });
    }
    const anonymous = options.url === "/api/v1/auth/login" || options.url === "/api/v1/invitations/accept";
    if (method !== "GET" && !anonymous) parameters.push({ name: "x-csrf-token", in: "header", required: true, schema: { type: "string" } });
    const responses: Record<string, unknown> = {};
    for (const [status, value] of Object.entries(object(schema.response))) responses[status] = { description: "Successful response", content: { "application/json": { schema: value } } };
    if (!Object.keys(responses).length) responses[method === "POST" && /\/(workspaces|invitations|files)$/.test(options.url) ? "201" : "200"] = { description: "Successful response; see runtime implementation and acceptance tests for the response shape." };
    if (options.url.endsWith("/callback")) { delete responses["200"]; responses["302"] = { description: "Redirect to the same-origin connected accounts view after validated provider consent.", headers: { Location: { schema: { type: "string", format: "uri" } } } }; }
    responses.default = { description: "Sanitized failure", content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["code", "message", "requestId"], properties: { code: { type: "string" }, message: { type: "string" }, requestId: { type: "string", format: "uuid" } } } } } };
    paths[path] ??= {};
    paths[path][method.toLowerCase()] = { "x-tantu-status": "implemented-local", security: anonymous ? [] : [{ sessionCookie: [] }], parameters, ...(schema.body ? { requestBody: { required: true, content: { "application/json": { schema: schema.body } } } } : {}), responses };
  }
}
const database = new Database({ max: 1 });
createApp(readEnvironment({ NODE_ENV: "test" }), { database, settings: { origin: "http://localhost:3000", secureCookies: false, storagePath: "/tmp/tantu-contract-export-unused", signingSecret: "unused-contract-export-no-server-started", scannerHost: "127.0.0.1", scannerPort: 3310 } }, capture);
await database.close();
if (Object.keys(paths).length < 15) throw new Error("Application routes were not captured.");
const output = JSON.stringify({ openapi: "3.1.0", info: { title: "tantu local foundation and connected-work API", version: "1.1.0", description: "Generated from registered request schemas and implemented canonical responses. No provider or production certification is implied. Some auxiliary responses intentionally remain described rather than falsely specified." }, components: { securitySchemes: { sessionCookie: { type: "apiKey", in: "cookie", name: "tantu_session" } } }, paths }, null, 2) + "\n";
const target = new URL("../../contracts/l1a.openapi.json", import.meta.url);
if (process.argv.includes("--check")) { if (await readFile(target, "utf8") !== output) throw new Error("OpenAPI is stale. Run npm --prefix backend run contracts:openapi."); }
else await writeFile(target, output);
