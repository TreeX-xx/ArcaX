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

Choose **Custom S3 / Compatibility Mode** and select Auto / Other S3, Tencent
COS, Alibaba OSS or Huawei OBS. The provider selector fills an empty endpoint;
editing its region updates a generated endpoint. Existing manual endpoints are
preserved. Exact regional service hosts supply the signing region and use
virtual-hosted addressing. Unknown custom endpoints retain path style by default.
Older profiles default to Auto; AWS credential sources retain their existing flow.

| Provider | Recommended endpoint | Local connection rules | Cloud acceptance |
| --- | --- | --- | --- |
| Tencent COS | `https://cos.ap-guangzhou.myqcloud.com` | Endpoint region, virtual host | Not run for 0.0.7 |
| Alibaba OSS | `https://s3.oss-cn-hangzhou.aliyuncs.com` | Endpoint region, virtual host; native `oss-` hosts route SDK requests through `s3.oss-` | Not run for 0.0.7 |
| Huawei OBS | `https://obs.cn-north-4.myhuaweicloud.com` | Endpoint region, virtual host, HTTPS and V4 unsigned payload | Not run for 0.0.7 |

OSS accounts may require S3 authentication to be enabled. See the
[official AWS SDK setup](https://help.aliyun.com/zh/oss/developer-reference/use-aws-sdks-to-access-oss)
and [V4 account prerequisite](https://help.aliyun.com/en/oss/user-guide/0002-00000033).
OBS payload and checksum settings follow the
[official V4 guidance](https://support.huaweicloud.com/obs_faq/obs_faq_0274.html).
Custom/internal/accelerated domains outside the recognized regional formats need
manual settings; no extra provider presets are included in this version.

**Paste connection configuration** accepts literal YAML (`KEY: "value"`) or env
(`KEY=value`) fields, with a 32 KiB limit. It fills the form and clears the raw
paste immediately. Supported groups are `OBS_ENDPOINT_URL` / `OBS_ACCESS_KEY` /
`OBS_SECRET_KEY`, `OSS_ENDPOINT` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET`,
`COS_ENDPOINT` / `COS_SECRET_ID` / `COS_SECRET_KEY`, or `S3_ENDPOINT` (also
`S3_ENDPOINT_URL`) with `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. Optional
bucket fields are `OBS_BUCKET`, `OSS_BUCKET`, `COS_BUCKET` or `S3_BUCKET`;
optional token fields are `OBS_SECURITY_TOKEN`, `OSS_SECURITY_TOKEN`,
`COS_SESSION_TOKEN` or `AWS_SESSION_TOKEN`. Conflicting aliases are rejected.
Expressions are never executed; vendor process-environment discovery is not added.

**Advanced settings** contains addressing overrides, an optional session token,
and public/CDN URL configuration. Tokens use the same secret storage as access
secrets and never appear in profile metadata or API responses. Editing preserves
an omitted token; enter a replacement or use **Clear saved token**. Expired tokens
must be replaced manually. There is no automatic STS issuance or renewal.

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
