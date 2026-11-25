# Website Screenshots

Dark-mode, website-ready screenshots are available in:

`public/screenshots/website/dark/`

Each PNG is 3840 x 2160 and can be referenced from the website with paths like:

`/screenshots/website/dark/07-browse-folder-actions.png`

The ordered screenshot metadata is in:

`public/screenshots/website/dark/manifest.json`

Suggested website order:

1. Start by connecting an account
2. Open cloud profile setup
3. Add AWS or S3-compatible storage
4. Jump directly to any S3 path
5. Browse all buckets
6. Explore a bucket root
7. Manage folders and objects
8. Search within the current folder
9. Track uploads
10. Track downloads
11. Tune settings and updates
12. Manage saved profiles

## README screenshots

The English README uses the light-mode screenshots in `docs/screenshots/`. The Chinese README uses the Simplified Chinese captures in `docs/screenshots/zh-CN/`. The capture script uses the static build and a mocked desktop backend.

```bash
pnpm build
pnpm screenshots:readme
```

The capture script is `scripts/capture-readme-screenshots.mjs`. For each language it writes `all-buckets.png`, `object-browser.png`, `uploads.png` and `settings.png` at 2880 × 1800. It also writes `s3-providers.png`, cropped to the connection dialog with the storage provider menu open.
