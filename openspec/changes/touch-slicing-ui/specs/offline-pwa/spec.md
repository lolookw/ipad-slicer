# offline-pwa Specification

## Purpose

Allow the installed slicer to reopen and use downloaded resources offline while preserving isolation and coherent app, engine, and profile versions.

## Requirements

### Requirement: Offline Resource Cache

The system MUST cache the app shell, required engine parts and supporting assets, and downloaded profile packs for offline use. It MUST distinguish complete offline readiness from a partial download and MUST NOT require all printer packs to be fetched at startup. Offline slicing MUST work for a cached engine and compatible cached profile pack after the installed app reopens.

#### Scenario: Reopen and slice offline

- GIVEN the app shell, selected engine assets, and selected printer pack are completely cached
- WHEN the installed PWA is reopened without a network connection
- THEN the user can import an STL, configure that cached profile, slice, preview, and save without a network request being required for those assets

#### Scenario: Incomplete cache is not advertised as ready

- GIVEN an engine part or selected profile pack was not downloaded or has been evicted
- WHEN the user attempts to use it offline
- THEN the app identifies the unavailable resource and does not claim that configuration is ready for offline slicing

### Requirement: Isolation-Preserving Service Worker

The service worker MUST preserve the required COOP/COEP behavior for app navigation and cached assets. Engine parts MUST retain same-origin, isolation-compatible delivery, and caching MUST NOT relax isolation requirements to make an asset load. A fully cached multithread-capable setup MUST remain cross-origin isolated when reopened offline.

#### Scenario: Cached multithread setup remains isolated

- GIVEN the online app is isolated and all assets required for the multithread path are cached
- WHEN the installed app is reopened offline
- THEN `crossOriginIsolated` remains true and the existing shared-memory probe can run under the same isolation requirements

#### Scenario: Cache does not bypass response restrictions

- GIVEN an asset response is incompatible with required isolation policy
- WHEN the service worker handles that response
- THEN it does not weaken COOP/COEP or treat the incompatible response as a usable offline engine asset

### Requirement: Versioned Cache and Update Prompt

The system MUST version caches and prompt the user when a new app version is ready. It MUST avoid mixing incompatible app shell, engine, schema, and profile resources across versions and MUST NOT interrupt an active slice to activate an update. An incomplete update MUST leave the current complete cached version usable.

#### Scenario: Defer a ready update

- GIVEN a new version is downloaded while a slice is active
- WHEN the update becomes ready
- THEN the app offers an update prompt while the active slice continues on its current version

#### Scenario: Activate a coherent update

- GIVEN a complete update is ready and no slice is active
- WHEN the user accepts the update
- THEN the next app session uses compatible versioned shell, engine, schema, and profile resources

#### Scenario: Interrupted update preserves existing offline use

- GIVEN a complete cached version exists
- WHEN the connection fails while downloading a newer version
- THEN the previously complete version remains available offline and the partial version is not activated

### Requirement: Visible Connectivity State

The system MUST report when it is offline and distinguish offline status from engine or slice failure. It MUST update the status when connectivity changes and explain when an operation requires uncached resources.

#### Scenario: Network connection is lost

- GIVEN the app is open with usable cached resources
- WHEN connectivity is lost
- THEN an offline status appears without disabling operations supported by the cached resources

#### Scenario: Uncached printer selection

- GIVEN the app is offline and a printer appears only in the cached index
- WHEN the user selects that uncached printer pack
- THEN the app explains that the pack needs a connection rather than reporting an engine crash
