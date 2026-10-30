---
{
  "schema": "harness-note/2",
  "id": "a0d7316f-3242-4b1f-99dd-3ee16cefc5de",
  "kind": "idea",
  "lifecycle": "draft",
  "created": "2026-10-30",
  "updated": "2026-10-30T03:03:36Z",
  "module": "note://f02ec38f-b877-41c0-84ae-af5efe88aff5/3a983575-a72f-4b46-b9a4-d64863705972"
}
---

# File drag and drop

## Intent

Planned design as of 2026-10-30; not implemented. Users should be able to drop files and folders from Explorer onto the object table to upload them, and drag objects out of ArcaX into Explorer or another application.

## Drag in

Tauri already delivers OS file drops through `getCurrentWebview().onDragDropEvent`; no plugin is needed. The bucket page registers the listener only while a bucket and profile are active.

- Mark the object table container as the drop zone and hit-test the physical event position against it after dividing by `devicePixelRatio`.
- `enter` and `over` show a restrained overlay naming the destination prefix; `leave` and `drop` clear it.
- `drop` sends the absolute paths to a new backend command, `inspect_drop_paths`, which classifies files and directories without following symlinks.
- Files queue through the existing `queue_upload`; directories queue through `queue_folder_upload` with the dropped directory name appended to the current prefix.
- Drops are rejected while a modal is open, when no bucket is active, or when a path is not absolute.
- Existing objects are overwritten, matching the current Upload action. A later iteration can add a conflict preview.

## Drag out

Native drag-out needs absolute local file paths, so the object must be materialized before the OS drag starts. The planned implementation uses the `tauri-plugin-drag` 2.1.1 plugin from CrabNebula, which wraps the `drag` crate and supports Windows, macOS and Linux (GTK). The plugin runs `DoDragDrop` on the main thread and accepts a list of files.

The async constraint is the hard part. A drag gesture starts on mouse-down and the browser fires `dragstart` synchronously; S3 downloads are asynchronous. The planned flow is:

1. `mousedown` on a draggable row starts a background download of the selected files into a temp drag cache, with a cap of 5 files and 100 MiB total.
2. `dragstart` checks the cache. If every path is present, it calls `startDrag` with the cached paths and a copy-mode option.
3. If any path is still missing, the drag is cancelled and a toast reports progress. When the download completes, the user drags again; the cached file makes the retry immediate.
4. Files above the cap and folders are drag-out disabled in the first cut; they keep the existing Download and Download Folder actions.

A `prepare_drag_file` backend command downloads one object to `app_cache_dir/drag/<uuid>-<safe-name>` and returns the absolute path. The cache is pruned on startup for files older than 24 hours. Filenames are reduced to a safe basename; the object key never becomes a path outside the cache directory.

The plugin needs `tauri-plugin-drag = "2.1.1"`, `.plugin(tauri_plugin_drag::init())` and the `drag:default` capability. Its JavaScript entry point is injected through `withGlobalTauri`; TypeScript needs a local declaration for `window.__TAURI__.drag.startDrag`.

## Reliability alternative

Windows Explorer integration is more predictable through a "Download and reveal" action than through a gesture that depends on a prior download. The first implementation can include `reveal_in_explorer(path)` as a fallback: `explorer /select,` on Windows, `open -R` on macOS and the parent directory on Linux. It also gives users a useful action for files that are too large for the drag cache.

## Risks

- A third-party plugin is added to the desktop shell; it must be reviewed and pinned.
- Temp copies consume disk and may outlive the session if pruning fails.
- Dragging a stale copy does not reflect later object changes; the temp file is a snapshot.
- A cancelled drag must not leave a partial temp file; downloads use a temporary name and rename on completion.

## Phases

1. Drag-in with the drop overlay and classification command.
2. Drag-out for cached files with the plugin and temp cache.
3. Download and reveal fallback, folder support and conflict handling.

## Open questions

- Is the two-step "prepare, then drag again" interaction acceptable, or should the app pre-download selected files more aggressively?
- Should drag-out use the plugin or a small Windows-specific OLE implementation to avoid a third-party dependency?
- How long should the drag cache survive, and should users be able to clear it from Settings?
