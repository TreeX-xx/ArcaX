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

The screenshots used by `README.md` live in `docs/screenshots/`. They are generated from the static build against the same mocked desktop backend the smoke tests use:

```bash
pnpm build
pnpm screenshots:readme
```

The capture script is `scripts/capture-readme-screenshots.mjs`. It writes `all-buckets.png`, `object-browser.png`, `uploads.png` and `settings.png` at 2880 x 1800.
