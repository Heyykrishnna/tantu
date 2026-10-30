# Network contract policy

The frontend and backend are separate npm packages. There is no shared business-logic package or speculative domain DTO layer in this scaffold.

The implemented transport surface is `GET /health/live`, returning HTTP 200 with `{"status":"ok"}` when the backend process can handle a request. It is liveness only. Other routes return a sanitized error with `code`, `message`, and a server-generated `requestId`.

The [L0 OpenAPI baseline](openapi.json) specifies strict draft request schemas, current-authorization requirements, operation/version identity, bounded search, reviewed external effects, and stable failures. Only liveness is implemented; every product operation is explicitly marked `draft-not-registered`. The isolated discovery suite compiles and tests these schemas without registering product routes.

The domain prefix is `/api/v1`. Generate or validate frontend clients against the authoritative contract as endpoints are implemented rather than hand-maintaining a second domain model. Contract checks do not prove production authorization or provider behavior.

Every mutating contract must define actor/scope, input validation, record version, operation identity, stable errors, pending remote effects, and permission checks. Searches and collections must use bounded pagination and must not reveal unauthorized records through counts, snippets, relationships, or cursors.
