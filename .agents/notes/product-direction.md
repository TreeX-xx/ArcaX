---
{
  "schema": "harness-note/2",
  "id": "5c8808da-d2cb-47cc-b79b-fb11c51e0087",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-30",
  "updated": "2026-10-30T03:23:23Z",
  "module": "note://f02ec38f-b877-41c0-84ae-af5efe88aff5/3a983575-a72f-4b46-b9a4-d64863705972"
}
---

# Product direction

## Intent

ArcaX already covers the core S3 client loop: browsing, transfer, ACLs, versions and bucket policies. This Note records candidate directions beyond the 0.0.2 baseline, the reasoning behind them and a suggested sequence. The directions are exploratory; no phase is scheduled, accepted or implemented.

The working judgement is that ArcaX has crossed from "viewer" into "lightweight S3 manager", so additional CRUD has low marginal value. The remaining gaps cluster into inspection depth, bucket-level understanding, findability, desktop-native affordances, and operational closure.

## Baseline as of 2026-10-30

- Connections: custom endpoints and providers, AWS shared profiles, IAM Identity Center SSO, OS keychain storage.
- Browsing: bucket and prefix navigation, breadcrumbs, direct `s3://bucket/prefix`, tabs, favorites, recent items, per-profile bucket cache.
- Search: prefix-scoped `list_objects_v2` scan with safety caps of 100 requests, 100,000 scanned objects and 10,000 matches (`src-tauri/src/commands/objects.rs`).
- Transfers: upload, download, copy, move, delete, recursive folders, multipart uploads, concurrency and bandwidth controls, URL import, cross-profile copy, local-to-S3 sync and scheduled jobs.
- Previews: presigned image, audio, video and PDF streaming; Monaco text and code editing up to a configurable size limit.
- Object management: properties, content-type edit, ACLs, version history and restore, presigned and public URLs.
- Bucket management: create, delete and policy only.
- Interface: English and Simplified Chinese.

## Candidate directions

Effort labels are relative: S is a small focused change, M is a feature-sized project, L is a multi-month or architecture-level investment.

### A. Deepen the viewer

The preview layer currently switches on media type and falls back to Monaco for everything textual. It treats structured, archived and binary formats as plain text or as non-previewable.

- Spacebar Quick Look and a thumbnail gallery. Preview exists as a dialog, but there is no overlay navigation or image grid.
- CSV/TSV table preview, JSON tree, NDJSON paging, and Parquet/Arrow row previews. Today CSV enters Monaco as text and Parquet/ORC are classified as binary (`src/lib/objectCapabilities.ts`).
- Rendered Markdown as an alternative to the source view.
- Archive browsing for zip, tar and gzip through S3 range reads instead of full downloads. These extensions are currently non-previewable.
- Text diff between two objects or two versions of one object.
- Hex viewer for small binary objects.

Most of A is S or M effort and directly strengthens the current product identity.

### B. Explain the bucket

ArcaX shows objects but not the shape of the bucket. This is the strongest differentiator against other desktop S3 clients, which usually stop at file operations.

- Bucket health panel: object count, total size, storage-class distribution, size distribution, age distribution and top prefixes.
- Duplicate and large-object ranking by ETag and size.
- Public exposure audit across bucket policy, ACLs, Block Public Access and sampled public objects.
- Incomplete multipart upload listing and cleanup, which addresses a common hidden storage cost.
- Bucket settings page for lifecycle, CORS, static website, versioning, encryption and bucket tags. Only create, delete and policy are implemented (`src-tauri/src/commands/bucket_management.rs`).
- Storage-class changes and Glacier restore. Storage class is currently read-only in Properties.
- Manifest export and a credential-free read-only HTML/PDF bucket report for people without S3 access.

B is mostly M effort and is the most likely source of user recommendation and paid value.

### C. Turn scanning into an index

S3 has no native metadata search. The current search is a bounded LIST scan, so repeated and cross-bucket discovery is expensive and capped.

- Local metadata index using SQLite FTS5: key, size, ETag, tags and modified time, crawled incrementally in the background, searchable across buckets and profiles. This enables instant search, saved queries and smart folders such as `ext:parquet size:>100MB modified:<7d`.
- Command palette for jumping to buckets, prefixes and actions.
- Full-bucket and cross-profile search beyond the current caps.
- Activity feed for recent changes, uploads and deletes.
- DuckDB SQL workspace over CSV/Parquet/JSON in S3 using range reads, with result export.
- Natural-language filtering that sends only metadata to a model and produces a structured query.

C is the long-term moat, but C is L effort and conflicts with LIST cost, staleness and privacy constraints.

### D. Close the transfer loop

Cross-profile copy and local-to-S3 sync exist, but verification and the reverse direction do not.

- Bucket or prefix comparison by key, size and ETag, producing a difference list.
- Migration verification report that compares checksums after a copy.
- Bidirectional sync with explicit conflict resolution; sync is currently local to S3 only.
- Watched folders and tray-resident background sync.
- Split-pane browsing for local-to-S3 or S3-to-S3 workflows.

### E. Strengthen desktop-native behaviour

- Drag-and-drop upload and drag-out to Explorer. The frontend currently has no drop handler; uploads go through the file picker.
- Configurable columns for storage class, ETag and owner; columns are currently fixed to name, size, updated and actions.
- Batch rename and batch tagging. Tagging is used only to preserve tags during copy and in tests; there is no tag editor.
- On-demand folder size; folders currently expose only a derived timestamp.
- Copy as an AWS CLI command and open in the AWS console.
- `s3://` protocol handler for launching from a browser or terminal.
- Connection presets and capability detection for R2, MinIO, Backblaze B2, Wasabi, DigitalOcean Spaces and similar providers.

### F. Expose the bucket to automation

- Read-only MCP server or CLI companion for querying buckets and reading objects, scoped to a profile and paired with an audit log.
- Operation history and dry-run previews for destructive actions.

## Recommended sequence

1. **0.1.x — finish the viewer (2 to 4 weeks).** Quick Look and gallery, structured data previews, rendered Markdown, drag-and-drop, tag and custom-metadata editing, on-demand folder size, configurable columns. These are small, visible and do not change the backend architecture.
2. **0.2.x — bucket insight (1 to 2 months).** Health panel, public exposure audit, multipart cleanup, manifest export and bucket settings. This is the clearest differentiation.
3. **0.3.x — search and data workspace (quarter-scale).** Local index and command palette first; DuckDB and MCP only after the index and permission model are proven.

The sequence deliberately puts depth before breadth. It avoids rebuilding a generic cloud console and keeps the "fast and focused" positioning.

Out of scope by current judgement: a full IAM or CloudTrail console, a generic multi-cloud file manager, and an AI assistant that executes destructive actions.

## Constraints and risks

- LIST cost and throttling: indexing and bucket health must be pausable, incremental and budgeted. Large buckets should prefer importing S3 Inventory over full LIST scans.
- Provider compatibility: ACL, policy, lifecycle and tagging support varies across S3-compatible providers. New features need capability detection and graceful degradation.
- Copy-in-place semantics: tag, metadata and storage-class changes rewrite the object. Versioned buckets create a new version, which the existing content-type editor already warns about.
- Preview security: presigned URL lifetime, content security policy and editor size limits must cover each new preview type.
- Agent access: an MCP or CLI surface must be read-only by default, profile-scoped and auditable.
- Local index: disk usage, staleness and the fact that object metadata leaves the machine only if a model call is explicitly enabled.

## Open questions

- Does the product remain a fast viewer and manager, or become a data workspace with query and indexing?
- Should bucket insight depend on live LIST, cached crawl data or S3 Inventory import?
- Is a local metadata index acceptable given disk, privacy and freshness trade-offs?
- Which providers are tier-one for capability parity?
- What is the permission and audit model for MCP or CLI access?

## References

- `src-tauri/src/lib.rs` — registered command surface.
- `src/lib/objectCapabilities.ts` — preview classification.
- `src-tauri/src/commands/bucket_management.rs` — current bucket administration.
- `src-tauri/src/commands/objects.rs` — listing, search and safety limits.
- [Folder sync](../../docs/FOLDER_SYNC.md) — current local-to-S3 sync behaviour.
- [Cross-profile copy](../../docs/CROSS_PROFILE_COPY.md) — current migration path.
- [ArcaX](module.md) — module entry and related documents.
- [Archive browsing](archive-browsing.md) — implemented ZIP browsing and the planned TAR/gzip work.
- [File drag and drop](file-drag-and-drop.md) — detailed design for desktop-native upload and export.
