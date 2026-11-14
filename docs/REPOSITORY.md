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

## S3-compatible connections

Choose **Custom S3 / Compatibility Mode** to enter an endpoint and access keys.
The paste field accepts literal `OBS_ENDPOINT_URL`, `OBS_ACCESS_KEY`,
`OBS_SECRET_KEY` and optional `OBS_BUCKET` entries in YAML (`KEY: "value"`) or
env (`KEY=value`) form. It fills the form and immediately clears the pasted
text; imported secrets use the existing credential storage. `OBS_*` process
environment variables are not loaded automatically.

For `https://cos.ap-guangzhou.myqcloud.com`, Auto uses virtual-hosted requests
(`https://bucket.cos.ap-guangzhou.myqcloud.com`) and derives `ap-guangzhou`
from the endpoint. Existing COS profiles get this behavior without being
recreated. Other custom endpoints retain path-style addressing by default;
the addressing selector allows an explicit override.

The optional **Target bucket** is saved with the connection. When present,
bucket discovery shows that bucket directly and **Test Connection** makes a
bounded, read-only ListObjectsV2 request (`max-keys=1`) against it, including
empty buckets. Clear it to discover all buckets. A denied account-wide
listing is reported as unverified access, with guidance to enter a target
bucket, rather than a successful connection. Tests time out after 20 seconds
of network waiting; no object downloads or writes are performed.

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
