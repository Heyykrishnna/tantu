# Backend foundation and package tooling

Date: 29 October 2026. Status: Adopted for the initial scaffold. This decision does not close L0 discovery or qualify production workloads.

## Context

The PRD fixes a TypeScript frontend and proposes either a TypeScript or Rust primary backend. Its initial recommendation for an integration-heavy TypeScript team is Fastify/Node.js. The existing frontend uses npm with its own lockfile, and the current request is to initialize a maintainable backend without product implementation.

## Decision

Use TypeScript, Node.js 24, and Fastify 5 for the backend boilerplate. Keep the isolated Go MinLZ integration reserved for future qualification. Use npm 11 consistently, with independently locked frontend and backend packages and root scripts that orchestrate their existing commands.

Keep the frontend framework configuration and dependency versions intact. Add a frontend type-check command so the root validation workflow can check both packages. Root orchestration has no dependencies and needs no installation of its own; `npm run setup` installs the two locked packages.

Implement only configuration, HTTP lifecycle, liveness, safe error handling, security defaults, and focused tests. Reserve the nine domain modules and infrastructure boundaries through empty directories and documentation. Unimplemented product routes return 404; no fake database, provider, queue, authentication, or AI service is introduced.

## Boundaries and remaining decisions

The current package choice is concrete and validated as scaffolding; no comparative Rust workload or production scalability result is claimed. PostgreSQL access/migrations, durable jobs, identity, collaboration, provider consent, file safety, hosting, region, retention, and optional AI remain decisions for their implementation stages.

The supplied PRD and roadmap remain dated planning baselines. This decision records the narrower implemented choice without rewriting their historical proposal language. Current setup and implementation status live in the project and package READMEs.

Application source is tracked in the project-root repository, with frontend and backend retaining independent npm packages. The [source-control decision](0002-source-control-consolidation.md) records the checkout and publication policy.

## References

- [Fastify server configuration](https://fastify.dev/docs/latest/Reference/Server/)
- [Fastify application testing](https://fastify.dev/docs/latest/Guides/Testing/)
- [Fastify Helmet compatibility](https://github.com/fastify/fastify-helmet)
