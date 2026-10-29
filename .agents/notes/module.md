---
{
  "schema": "harness-note/2",
  "id": "3a983575-a72f-4b46-b9a4-d64863705972",
  "kind": "module",
  "lifecycle": "accepted",
  "created": "2026-10-28",
  "updated": "2026-10-28T09:22:35Z",
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

## Related documents

- [Internationalization](i18n.md) — English/Chinese switching, message catalog and covered surfaces.
- [Release and automatic updates](release-process.md) — local build, GitHub Releases and the deferred updater direction.
