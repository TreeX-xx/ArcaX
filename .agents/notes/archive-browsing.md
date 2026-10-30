---
{
  "schema": "harness-note/2",
  "id": "258d253f-2ac0-43af-96c6-2d6e463621f6",
  "kind": "note",
  "lifecycle": "accepted",
  "created": "2026-10-30",
  "updated": "2026-10-30T03:37:33Z",
  "module": "note://f02ec38f-b877-41c0-84ae-af5efe88aff5/3a983575-a72f-4b46-b9a4-d64863705972"
}
---

# Archive browsing

## Status

ZIP browsing is implemented as of 2026-10-30. TAR, TAR.GZ and single-file GZ remain planned. This note records the current ZIP behaviour and the constraints that the remaining formats must preserve.

## Why the backend owns it

Archive parsing needs random access. A frontend implementation would `fetch` presigned URLs with `Range` headers, which requires bucket CORS; existing media previews avoid that by loading through media elements without reading the response. Buckets without CORS would therefore fail only for archives. The Rust backend already owns credentials, region discovery and profile guards, so it also owns the range reads.

## ZIP data path

1. `archiveApi.list` calls `list_archive_entries` with bucket, region, key and expected profile.
2. The backend validates the active profile, reads the object size and ETag with `head_object`, and creates a one-hour presigned GET URL.
3. `S3RangeReader` implements `Read + Seek` over HTTP range responses. It fetches aligned 1 MiB chunks, caches up to 16 MiB, verifies the response ETag against the listing, and rejects a server that ignores `Range` for an object larger than one chunk.
4. The blocking ZIP parser runs inside `tokio::task::spawn_blocking`, after the async presign step.
5. `zip::ZipArchive` reads the central directory at the end of the object. Listing therefore costs a small number of ranges instead of a full download.
6. `read_archive_entry` and `extract_archive_entry` reopen the archive and fetch only the local header and compressed data for the selected entry.

The implementation uses `zip` 4.6.1 with `deflate-flate2`, `reqwest` with the blocking feature, and `base64` 0.22.1. The ZIP parser lives in `src-tauri/src/archive/zip.rs`; the range reader lives in `range_reader.rs`; path safety lives in `path.rs`.

## Commands and types

- `list_archive_entries(bucket, region, key, expected_profile_id) -> ArchiveListing`
- `read_archive_entry(bucket, region, key, entry_id, max_bytes, expected_profile_id) -> ArchiveEntryContent`
- `extract_archive_entry(bucket, region, key, entry_id, destination_path, expected_profile_id) -> ExtractResult`

`ArchiveListing` carries the format, total entry count, total uncompressed size for the returned entries, a truncation flag and a flat entry list. `ArchiveEntry` carries an index-based id, normalized and raw paths, directory, size, compressed size, modified time, method, encryption and symlink flags, and an unsafe-path flag. The index is the id because ZIP permits duplicate names.

Cancellation and progress events are not implemented for ZIP; listing is a few range requests and completes quickly. They remain requirements for TAR.GZ, where the whole compressed stream must be scanned.

## Limits

- 20,000 listed entries; beyond that the result is truncated.
- Text entry preview 2 MiB; image entry preview 10 MiB. Larger entries are extract-only.
- One extracted entry 2 GiB.
- Entries above 100 MiB are rejected when their compression ratio exceeds 100:1.
- Only `.zip` keys are accepted. The frontend classifies `.zip` as `archive`; the backend enforces the extension again.

## Security

- `normalize_entry_path` replaces backslashes, strips leading `./`, and marks `..`, absolute paths, drive prefixes, control characters, invalid filename characters, trailing dots or spaces, and Windows reserved device names as unsafe.
- Unsafe, encrypted and symlink entries are listed but cannot be previewed or extracted.
- Extraction uses create-new semantics, reports an existing destination instead of overwriting, removes partial files on failure, and never launches the result.
- Presigned URLs and entry contents are not logged. The range reader strips URLs from request errors.
- The reader aborts if the ETag changes during an operation.

## Interface

`ObjectKind` includes `archive`, detected from the `.zip` extension. `ObjectPreviewDialog` branches to `ArchivePreviewDialog`, following the `ImagePreviewViewer` pattern. The dialog shows the entry count, uncompressed and archive sizes, a breadcrumb, a filter, a paginated table and a cache-independent summary; text and image entries open in a read-only detail view; other entries are extract-only. Archive entries are never editable. `usePreviewNavigation` now includes archives in the previous/next sequence.

## Verification

- Rust: 10 archive tests cover path normalization, unsafe paths, listing, deflate entries, text and image reads, extraction, overwrite refusal, compression-ratio limits and blocking-client construction.
- Full Rust suite: 157 passed, 0 failed, 9 ignored.
- Frontend: 25 files, 127 tests passed after adding archive detection and row grouping.
- `pnpm typecheck`, `pnpm lint` and `pnpm build` passed.

## Planned formats

| Format | Approach | Remaining work |
| --- | --- | --- |
| TAR | Header scan by range, raw entry extraction | ustar/PAX/GNU long-name parser |
| TAR.GZ / TGZ | Stream-decompress once, capped | Index cache, progress and cancellation |
| GZ | Decompress one file | Text/image preview and extraction |

TAR.GZ needs a compressed-size cap, a decompressed-scan cap, progress reporting and cancellation before it is safe to ship. Folder extraction and archive-entry drag-out are also deferred.

## Open questions

- Is a 512 MiB TAR.GZ cap acceptable, or should indexing move to a background job with a disk cache?
- Should archive listings persist on disk across launches, or stay in memory for one session?
- Which entry types beyond text and images justify a preview instead of Extract?
