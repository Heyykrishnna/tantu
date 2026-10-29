# Network contract policy

The frontend and backend are separate npm packages. There is no shared business-logic package or speculative domain DTO layer in this scaffold.

The implemented transport surface is `GET /health/live`, returning HTTP 200 with `{"status":"ok"}` when the backend process can handle a request. It is liveness only. Other routes return a sanitized error with `code`, `message`, and a server-generated `requestId`.

Introduce versioned OpenAPI contracts and runtime-validated schemas alongside the first real domain endpoints. The planned domain prefix is `/api/v1`; no product endpoints are registered yet. Generate or validate frontend clients against the authoritative contract rather than hand-maintaining a second domain model.

Every mutating contract must define actor/scope, input validation, record version, operation identity, stable errors, pending remote effects, and permission checks. Searches and collections must use bounded pagination and must not reveal unauthorized records through counts, snippets, relationships, or cursors.
