# Repository and distribution

ArcaX is maintained at https://github.com/TreeX-xx/ArcaX. It derives from
[Brows3](https://github.com/rgcsekaraa/brows3), with the original MIT copyright preserved. ArcaX starts its own Git history
from a source snapshot; the upstream history remains available in Brows3. ArcaX now versions independently from that
baseline; this snapshot starts at 0.0.1, which does not imply a binary release already exists.

## Architecture and development

The Next.js 16 / React 19 frontend uses MUI, Zustand and a virtualized object
table. Tauri 2 connects it to Rust commands for S3-compatible storage,
credential management, transfers and scheduled sync. The frontend is statically
exported for packaged builds. Browser-only development cannot perform native
S3 operations.

Use Node.js 22 or newer, pnpm 11.2.2, stable Rust and the platform's Tauri native
build prerequisites. Windows requires MSVC C++ Build Tools and WebView2.
Run `pnpm install --frozen-lockfile`, then `pnpm tauri dev`; this starts both
the frontend on port 3001 and the desktop window. Run `pnpm tauri build` for
local installers. Local Cargo mirror settings are ignored by Git.

## Distribution

The tests workflow runs on main pushes and pull requests. The manually triggered
Desktop packages workflow produces downloadable Windows, macOS and Linux build
artifacts, but it does not publish GitHub Releases or upload to package registries.

Releases are built locally with `pnpm tauri build` and published manually to
[GitHub Releases](https://github.com/TreeX-xx/ArcaX/releases). Windows builds are
unsigned; macOS builds use ad-hoc signing.

Automatic updating is not configured yet: no updater endpoint or public key is
present, and updater artifacts are not generated. The intended update source is
ArcaX GitHub Releases; enabling it requires signing keys and a published update
manifest.

The original release, crates.io and experimental Linux workflows and signed
update manifest are archived in `docs/upstream-workflows/`. They are reference
material, not active ArcaX automation. Existing distribution scripts, registry
guides and articles describe the upstream release system. Adapt and test
them against ArcaX identities before using them; do not publish under the
upstream crate or winget identifier. No ArcaX registry ownership is assumed.

Source releases exclude local agent configuration, Cargo mirror settings, build
outputs, environment files and local profile/secret files. Cloud credentials
remain in the application's local credential storage.
