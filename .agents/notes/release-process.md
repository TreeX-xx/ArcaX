---
{
  "schema": "harness-note/2",
  "id": "73ca2fd3-118b-4c1d-9945-bcda208d0473",
  "kind": "decision",
  "lifecycle": "accepted",
  "created": "2026-10-28",
  "updated": "2026-10-28T10:29:11Z",
  "module": "note://f02ec38f-b877-41c0-84ae-af5efe88aff5/3a983575-a72f-4b46-b9a4-d64863705972"
}
---

# Release and automatic updates

## Problem

ArcaX no longer uses the upstream update channel. Builds are produced locally by the maintainer, and the distribution path and automatic-update direction must be explicit instead of implied by inherited tooling.

## Decision

- The maintainer builds installers locally with `pnpm tauri build`.
- The current release scope is Windows x64 only (MSI and NSIS). macOS and Linux artifacts are not produced until those builds are run on their own systems.
- Windows bundles use the WebView2 `downloadBootstrapper` mode. The installer is smaller, and internet access is only needed when WebView2 is missing.
- The resulting artifacts are published manually to [ArcaX GitHub Releases](https://github.com/TreeX-xx/ArcaX/releases), together with a `SHA256SUMS.txt` file.
- The Desktop packages GitHub Actions workflow may still produce downloadable artifacts, but it does not publish releases.
- Automatic updates are intentionally left unconfigured in this build. No updater endpoint, public key, or update manifest is present, and `createUpdaterArtifacts` remains `false`.
- The intended automatic-update source is ArcaX GitHub Releases. Implementation is deferred until signing keys and a published update manifest exist.

## Procedure

1. Set the same new version in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`.
2. Run the checks: `pnpm typecheck`, `pnpm lint`, `pnpm test:frontend` and `pnpm test:rust`.
3. Build installers locally with `pnpm tauri build`.
4. Collect the produced bundles from `src-tauri/target/release/bundle/` (on Windows: MSI and NSIS).
5. Generate `SHA256SUMS.txt`, create a GitHub Release tagged `v<version>` in `TreeX-xx/ArcaX`, and upload the artifacts and checksums manually.
6. Do not publish an updater manifest yet: automatic updates remain unconfigured.

## Alternatives considered

- **Publish from CI:** not chosen for the current process; local builds are the release source.
- **Implement the updater now:** deferred because updater signing keys, manifest hosting and a stable release endpoint are not ready.
- **Keep the upstream updater configuration:** rejected; it would let another project's release replace this build.

## Consequences

- Each release is a manual but reproducible local build and upload step.
- Windows installers remain unsigned, so SmartScreen may warn. Offline installation requires WebView2 to be present already; otherwise the installer downloads it.
- Until the updater is implemented, users update by downloading a newer GitHub Release.
- Enabling automatic updates later requires all of: a new version, updater signing keys, a public key in `src-tauri/tauri.conf.json`, generated updater artifacts, and an update endpoint pointing at ArcaX releases.
