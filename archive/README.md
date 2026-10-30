# Historical archive adapter

This boundary contains an isolated [qualification module](qualification/README.md) pinned to upstream MinLZ v1.2.0. It is an L0 experiment with an independent byte oracle, integrity/offset/privacy fixtures, resource limits, race checks, bounded fuzzing, and a synthetic benchmark. No production archive worker or product search endpoint is enabled.

The main product backend is TypeScript. The future archive adapter will expose a narrow internal interface after corpus suitability, trusted manifest/object identity, encryption, deployment limits, and current-access enforcement are qualified for production. Local synthetic results do not close those production gates.

Exact archive search must match an independent decoded-byte oracle, handle block boundaries, reject stale/corrupt pairings, recheck current access and deletion state, and report complete, partial, and failed outcomes honestly. Ordinary live search remains a separate backend path.

Production enablement requires its own correctness, security, suitability, and bounded-resource evidence. See the [PRD](../docs/product-requirements.md) for the planning baseline.
