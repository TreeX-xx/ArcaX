---
{
  "schema": "harness-note/2",
  "id": "6724b57d-5a29-49c6-b46a-8718aaa83723",
  "kind": "note",
  "lifecycle": "accepted",
  "created": "2026-11-14",
  "updated": "2026-11-14T02:36:21Z",
  "module": "note://f02ec38f-b877-41c0-84ae-af5efe88aff5/3a983575-a72f-4b46-b9a4-d64863705972"
}
---

# S3 connections

## Addressing and compatibility

`Profile.addressing_style` defaults to `auto` when absent, preserving older profile files. Auto uses virtual-hosted addressing for exact regional `cos.<region>.myqcloud.com` hosts and path style for other custom endpoints. Explicit `virtual` and `path` settings override the choice. AWS connections without a custom endpoint retain their existing SDK behavior. COS signing region comes from the endpoint, including older profiles containing the UI default `us-east-1`. Endpoint and credential input values do not need to change.

This resolves the observed COS `403 PathStyleDomainForbidden` response from path-style object listings. Matching uses parsed hostnames, not substring detection. Unrecognized COS variants (bucket-specific domains, internal or accelerated endpoints) require explicit settings; provider-specific expansion should have request-level coverage before changing Auto behavior. Existing MinIO and generic endpoint defaults remain path style.

The client builder in `src-tauri/src/s3/client.rs` is shared by connection tests, browsing, transfers and presigning. Default public URLs in `src-tauri/src/transfer/public_url.rs` follow the same custom-endpoint addressing choice; public/CDN overrides take precedence and never grant access.

## Entry and verification

`ProfileDialog` accepts literal OBS YAML/env entries through an explicit paste field, with a 32 KiB bound. It fills endpoint, credentials and optional target bucket, clears the raw pasted text immediately, masks the secret field and uses the existing secret-storage lifecycle. It never evaluates pasted expressions. This is a form import, not automatic OBS process-environment discovery. `src/lib/s3Endpoint.ts` owns frontend endpoint detection and import parsing.

Optional `Profile.default_bucket` bypasses account-wide bucket discovery and displays the configured bucket. It does not claim that the bucket exists or is accessible: Test Connection verifies ListObjectsV2 with max-keys=1, and actual browsing still reports service errors. Empty accessible buckets pass. Without a target, testing lists all buckets. AccessDenied is a failed check, never proof of authenticated access. Both network checks have a 20-second timeout and perform no writes or object downloads.

Known fixed connection-test messages have Chinese translations; provider messages and dynamic diagnostic details retain their original text. The user-facing instructions live in [Repository and distribution](../../docs/REPOSITORY.md).

## Connection error presentation

Object-list failures remain in the page with retry guidance; failed refreshes preserve the previously loaded data and display an inline warning. Transient notifications are bounded, repeated errors merge, and timers pause while the user reads details. Scheduling-storage failures remain persistent. The timing and deduplication rules are maintained in [Design](../../DESIGN.md).

## Regression coverage

Frontend unit/component tests cover literal OBS import, masked credentials, target-bucket payloads, saved fields and older COS profile display. Native tests cover generated request hosts/signing regions, explicit overrides, MinIO path style, old profile defaults, target-listing checks, denial handling, configured-bucket discovery without a network request and COS public URL encoding. All credentials in these tests are synthetic; real-account credential validity is not established by local fixtures.

## Local build verification

The Windows x64 0.0.6 installers were built from the current working tree on 2026-11-14 with `CARGO_BUILD_JOBS=1` and `pnpm tauri build --bundles 'nsis,msi'`. EXE and MSI product versions were read back as 0.0.6. The deliverables are collected in `build/ArcaX-0.0.6/` with `SHA256SUMS.txt`; copied installers match their original bundle hashes. The release destination is [ArcaX 0.0.6](https://github.com/TreeX-xx/ArcaX/releases/tag/v0.0.6); publication and asset integrity are checked against GitHub separately from the local build.

Validation passed: `pnpm typecheck`, `pnpm lint`, `node node_modules/vitest/vitest.mjs run --maxWorkers=2` (159 tests), `node --test .github/scripts/*.test.js` (23 tests), and `cargo test --manifest-path src-tauri/Cargo.toml --all-features --locked -j 1` (169 passed, nine external-service tests ignored). The initial concurrent full checks exhausted memory; these bounded reruns completed successfully.

Production Chromium checks ran with `node node_modules/@playwright/test/cli.js test --project=chromium --workers=2`: 49 of 51 passed initially. The two failures came from the older preview-selection fixture treating ZIP as non-previewable; that fixture now uses `.bin` for its binary-skip case, matching the existing ZIP support. All four tests in `tests/smoke/preview-selection.spec.ts` passed on the targeted rerun. No application code changed for that fixture correction. WebKit, installer execution and real Tencent COS account operations were not tested in this build.
