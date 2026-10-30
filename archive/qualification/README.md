# MinLZ qualification module

Scope: L0 engineering validation only. Upstream pin: `github.com/minio/minlz v1.2.0`, released source commit `66139577a08761e5286e1a87001e0fde963498c3`. The module and checks are isolated from the production backend. MinLZ’s Apache-2.0 license and dependency notices must be retained when distributing a future adapter.

The suite compares inline and sidecar search offsets against an independent decoded-byte oracle for ASCII, short, absent, Unicode/multibyte, overlapping, and cross-block patterns. It checks round trips, missing-table fallback, stream/sidecar digest mismatch, malformed input, revoked/foreign/deleted record spans, and patterns crossing record boundaries.

Query fixtures enforce pattern/input/result bounds, cancellation, expired deadlines, and a 4-KiB search-block ceiling. Limited results report `partial`; malformed input reports `failed`. The bounded full decoder uses an 8-KiB allocation ceiling because upstream v1.2.0 rejects its documented 4-KiB decoder boundary. Generated streams remain 4-KiB-block streams, search stays capped at 4 KiB, and total decoded output has its own independent limit.

`ValidatePair` models trusted generation/digest checks with a full compressed-object hash. It is not an optimized remote range-read implementation. Production needs trusted immutable object identities, key management, authenticated encryption, and deletion/authorization rechecks; passing a caller-invented digest is not proof of integrity.

From this module, with a supported Go 1.24+ toolchain:

```bash
go test -race ./...
go test -run=^$ -fuzz=FuzzOracleParity -fuzztime=5s -parallel=2
go test -run=^$ -bench=BenchmarkIndexedSearch -benchtime=20x -benchmem
```

The root archive check additionally runs vet, verifies the module pin, and writes ignored evidence. Set `TANTU_GO_BINARY` when Go is not on PATH. Full L0 execution also includes formatting and integration checks described in the discovery guide.

The benchmark uses a highly compressible synthetic corpus and reports logical input bytes, not physical I/O bandwidth or expected customer performance. No production enablement, encryption deployment, retention guarantee, or universal search-speed advantage is claimed.

References: [pinned release](https://github.com/minio/minlz/releases/tag/v1.2.0), [search behavior](https://github.com/minio/minlz/blob/v1.2.0/SEARCH.md), and [stream format](https://github.com/minio/minlz/blob/v1.2.0/SPEC.md).
