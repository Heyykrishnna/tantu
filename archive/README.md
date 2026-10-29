# Historical archive adapter

This boundary reserves the isolated Go integration with the upstream MinLZ implementation. No Go module, archive worker, compression library, or historical search implementation is installed yet.

The main product backend is TypeScript. The archive adapter will expose a narrow internal interface after the upstream release, license, corpus, manifest/sidecar format, encryption, and resource limits are qualified.

Exact archive search must match an independent decoded-byte oracle, handle block boundaries, reject stale/corrupt pairings, recheck current access and deletion state, and report complete, partial, and failed outcomes honestly. Ordinary live search remains a separate backend path.

Production enablement requires its own correctness, security, suitability, and bounded-resource evidence. See the [PRD](../docs/product-requirements.md) for the planning baseline.
