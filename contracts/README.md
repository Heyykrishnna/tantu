# Network contracts

The implemented local foundation/connected-work API is [l1a.openapi.json](l1a.openapi.json), generated from registered Fastify request schemas and strict canonical response schemas. Auxiliary responses without a schema are explicitly described; they are not falsely advertised as fully specified. Browser response parsers validate the fields the UI uses.

Canonical task/page TypeScript interfaces are generated into the frontend from the backend source. Run `npm --prefix backend run contracts:types` and `npm --prefix backend run contracts:openapi` after changing interfaces or route schemas. `contracts:check` rejects stale artifacts. Generation captures registration metadata without starting HTTP, connecting a database or creating data.

The [L0 OpenAPI baseline](openapi.json) is preserved as a historical draft. Its product operations are marked `draft-not-registered`; it must not be treated as the current implemented-route registry. The generated current registry includes implemented project/schedule/provider/knowledge slices; the older filename remains for compatibility. Search/automation and unimplemented product effects are not advertised as available.

Current `/api/v1` routes use a server-side session cookie, live workspace/record authorization and CSRF/Origin checks for unsafe requests. Canonical mutations require UUID operation identity; updates/deletes require expected versions. Lists use bounded keyset pagination. Errors expose only stable code, sanitized message and generated request ID. `/health/live` is process liveness; `/health/ready` is an HTTP database probe.

The backend owns authorization and durability. Generated types and successful schema checks cannot certify provider support, malware detection, manual accessibility or production readiness. See [L1A evidence](../docs/l1a/readiness.md) and [L1B scope/readiness](../docs/l1b/readiness.md).
