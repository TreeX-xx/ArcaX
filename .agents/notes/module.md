---
{
  "schema": "harness-note/2",
  "id": "3a983575-a72f-4b46-b9a4-d64863705972",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-28",
  "updated": "2026-10-30T03:23:23Z",
  "role": "project",
  "moduleState": "implemented"
}
---

# ArcaX

## Responsibility

ArcaX is a Tauri desktop client for Amazon S3 and S3-compatible object storage. The Rust core handles S3 access, transfers, credentials and persistence; the Next.js frontend renders the workspace, profiles, object browser and dialogs.

## Design

The frontend is a statically exported Next.js app loaded by the Tauri shell. Zustand stores hold UI state (`appStore`, `settingsStore`, `transferStore`, `historyStore`, `profileStore`, `toastStore`, `monitorStore`). Rust commands are wrapped by `src/lib/tauri.ts`, which also applies profile guards and cache invalidation events.

Interface language is a persisted user setting. See [Internationalization](i18n.md) for the language model, the translation workflow and the remaining backend gaps.

ZIP archive browsing uses a synchronous `Read + Seek` range reader in `src-tauri/src/archive/` and is surfaced by `ArchivePreviewDialog`; see [Archive browsing](archive-browsing.md) for the data path, limits and planned TAR/gzip work.

## Related documents

- [Product direction](product-direction.md) — exploratory feature directions and a suggested sequence beyond the 0.0.2 baseline.
- [Archive browsing](archive-browsing.md) — implemented ZIP range browsing and the planned TAR/gzip work.
- [File drag and drop](file-drag-and-drop.md) — planned OS drop upload and native drag-out design.
- [Internationalization](i18n.md) — English/Chinese switching, message catalog and covered surfaces.
- [Release and automatic updates](release-process.md) — local build, GitHub Releases and the deferred updater direction.
