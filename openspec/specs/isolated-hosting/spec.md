# isolated-hosting Specification

## Purpose

Deploy the harness on Cloudflare Workers (static assets) with cross-origin isolation active and the OrcaWasm engine binaries reachable same-origin, despite each binary (`slicer.wasm` 38.1MB, `slicer-mt.wasm` 37.3MB) exceeding the 25 MiB per-static-asset limit ([Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).

## Requirements

### Requirement: Cross-Origin Isolation Headers

The system MUST serve COOP/COEP response headers from Cloudflare Workers so that `crossOriginIsolated` is true whenever the multithread path is enabled.

#### Scenario: Isolation active in production

- GIVEN the harness is deployed to Cloudflare Workers
- WHEN a user loads the page and multithread is attempted
- THEN `window.crossOriginIsolated` is true

### Requirement: Same-Origin WASM Delivery Within Platform Limits

The system MUST deliver `slicer.wasm` and `slicer-mt.wasm` to the page same-origin, and MUST NOT violate the Workers 25 MiB single static asset limit, while keeping cross-origin isolation intact when the multithread path is enabled. The exact delivery mechanism (e.g. chunking, a Worker script proxy, alternate object storage fetched same-origin, or another approach) is an implementation decision left to design; this requirement is implementation-neutral.

#### Scenario: Engine instantiates despite the 25 MiB cap

- GIVEN `slicer.wasm` is 38.1MB, larger than the 25 MiB static asset cap
- WHEN the page requests the engine binary
- THEN the binary is retrieved and instantiated successfully without a platform size-limit error

#### Scenario: Isolation preserved by the delivery mechanism

- GIVEN the multithread path is enabled and the wasm binary is delivered via the chosen mechanism
- WHEN the page loads
- THEN `crossOriginIsolated` remains true

### Requirement: Correct WASM Content-Type

The `Response` handed to `WebAssembly.instantiateStreaming` MUST carry `Content-Type: application/wasm`. The engine is delivered as gzip parts (`*.wasm.gz.partN`), so the network responses themselves are gzip bytes and MUST NOT claim `application/wasm`; the loader reconstructs the wasm stream and sets the header on the `Response` it compiles.

#### Scenario: Streaming compile receives the wasm content type

- GIVEN the worker has fetched and decompressed the engine parts
- WHEN it calls `instantiateStreaming`
- THEN the `Response` passed in reports `Content-Type: application/wasm` and the load path is `streaming`

### Requirement: Git-Connected Deployment

The system MUST deploy through the Cloudflare Workers Git integration: pushes to the production branch deploy production, and non-production branches get a preview URL, so the only manual steps are the one-time account and repository connection.

#### Scenario: Branch preview available for device testing

- GIVEN the repository is connected to Cloudflare Workers Builds with non-production branch builds enabled
- WHEN a commit is pushed to a non-production branch
- THEN a preview URL for that branch serves the harness with the same headers as production

### Requirement: PWA and License Compliance

The system MUST serve a minimal PWA manifest and MUST publish the AGPL-3.0 LICENSE with a link to source, per the accepted license decision.

#### Scenario: License and manifest reachable

- GIVEN the harness is deployed
- WHEN a user requests `LICENSE` or the manifest
- THEN both are served and the manifest references valid icons/start URL
