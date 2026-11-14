---
{
  "schema": "harness-note/2",
  "id": "6724b57d-5a29-49c6-b46a-8718aaa83723",
  "kind": "note",
  "lifecycle": "accepted",
  "created": "2026-11-14",
  "updated": "2026-11-14T03:36:08Z",
  "module": "note://f02ec38f-b877-41c0-84ae-af5efe88aff5/3a983575-a72f-4b46-b9a4-d64863705972"
}
---

# S3 connections

## Addressing and compatibility

`Profile.provider` defaults to `auto`; explicit `cos`, `oss` and `obs` selections only apply to custom S3 connections. `Profile.addressing_style` also defaults to `auto`. Exact regional COS (`cos.<region>.myqcloud.com`), OSS (`s3.oss-<region>.aliyuncs.com` or native `oss-<region>.aliyuncs.com`) and OBS (`obs.<region>.myhuaweicloud.com`) hosts use virtual-hosted addressing and derive the signing region from the endpoint. OSS internal regional hosts remove `-internal` only from the signing region. Native OSS inputs route SDK traffic to the official `s3.oss-` endpoint; entered/public URLs remain intact. Unknown custom hosts retain path style. Explicit addressing overrides remain available; AWS credential sources retain existing behavior.

Matching uses parsed exact service hostnames, not substrings or bucket-prefixed domains. Older COS profiles still derive their endpoint region even if their saved region is `us-east-1`. Explicit provider/recognized-host mismatches are rejected. OBS requires HTTPS and installs an SDK interceptor selecting `UNSIGNED-PAYLOAD` before V4 signing, as required by the official OBS guidance. Optional request/response checksums use `WhenRequired`. Generic and MinIO defaults stay unchanged. No native provider SDK, automatic STS renewal, or generic capability framework was introduced. The two direct AWS runtime dependencies are pinned to the currently locked SDK versions for the OBS signing interceptor; align them when upgrading the SDK and retain the captured-request regression.

The client builder in `src-tauri/src/s3/client.rs` is shared by connection tests, browsing, transfers and presigning. Default public URLs in `src-tauri/src/transfer/public_url.rs` follow the same custom-endpoint addressing choice; public/CDN overrides take precedence and never grant access.

## Entry and verification

`ProfileDialog` keeps the existing credential-source selector. Custom S3 adds one compact provider selector: Auto / Other S3, Tencent COS, Alibaba OSS, Huawei OBS. A selection fills an empty/generated endpoint; existing manual endpoints are preserved. Endpoint-derived regions are displayed, generated endpoints follow region edits, and any field change invalidates an in-flight or displayed test result. One collapsed Advanced settings section contains addressing, optional token and existing public/CDN fields. There is one Test Connection button and one result; the redundant success chip was removed. Existing neutral MUI styling and dialog structure are reused.

The single literal YAML/env paste field supports COS, OSS, OBS and standard S3/AWS aliases with a 32 KiB bound. Conflicting aliases fail rather than choosing a credential silently. Input is never evaluated; raw pasted text is cleared immediately. Vendor process-environment discovery is not added. `src/lib/s3Endpoint.ts` owns frontend detection/import, and `tests/fixtures/s3-providers.json` supplies the shared frontend/native hostname cases.

Custom-endpoint session tokens live in a separate secret entry (`<secret_ref>:session`) and are omitted from profile JSON and IPC serialization. Profile Debug output redacts credentials. A non-secret `has_session_token` marker allows explicit clearing and prevents silent token loss when storage cannot be read. Omitted edits preserve the stored token, a supplied value replaces it, and an explicit empty value clears it. A new secret reference is written before metadata commit; failure removes new entries, successful edits/deletion queue both old secret and token cleanup. A failed saved-token read blocks use/update until replacement or explicit clear. Switching credential sources removes custom tokens. Expiry is handled manually through the existing connection error result.

Optional `Profile.default_bucket` bypasses account-wide bucket discovery and displays the configured bucket. It does not claim that the bucket exists or is accessible: Test Connection verifies ListObjectsV2 with max-keys=1, and actual browsing still reports service errors. Empty accessible buckets pass. Without a target, testing lists all buckets. AccessDenied is a failed check, never proof of authenticated access. Both network checks have a 20-second timeout and perform no writes or object downloads.

Known fixed connection-test messages have Chinese translations; provider messages and dynamic diagnostic details retain their original text. The user-facing instructions live in [Repository and distribution](../../docs/REPOSITORY.md).

## Connection error presentation

Object-list failures remain in the page with retry guidance; failed refreshes preserve the previously loaded data and display an inline warning. Transient notifications are bounded, repeated errors merge, and timers pause while the user reads details. Scheduling-storage failures remain persistent. The timing and deduplication rules are maintained in [Design](../../DESIGN.md).

## Regression coverage

Frontend tests cover all shared hostname fixtures, literal aliases/conflicts, masked temporary tokens, provider presets/manual endpoint preservation, token clear/preserve payloads and stale-result invalidation, in addition to older COS and target-bucket behavior. Native tests cover each provider's presigned host/signing region, OSS native-to-S3 routing, explicit overrides, OBS PUT payload signing and security-token header capture, token persistence/restart/rollback/deletion/read failure, and public URL encoding. Existing transfer and conditional-write tests continue to apply. All credentials are synthetic; local captures establish generated-request behavior, not service acceptance.

0.0.7 cloud acceptance is **not run** for all three providers: listing/pagination and unusual keys, upload/download, multipart cancel/abort, presigned GET/Range and previews, copy/delete, STS and restricted accounts, cross-provider copy/sync, conditional overwrites and advanced ACL/version/policy/bucket operations. These remain the agreed cloud matrix below; do not label a provider “verified compatible” until its real-account evidence exists. Unsupported conditional writes retain the existing fail-without-unconditional-fallback behavior.

## 0.0.6 release verification

The Windows x64 0.0.6 installers were built from the 0.0.6 release tree on 2026-11-14 with `CARGO_BUILD_JOBS=1` and `pnpm tauri build --bundles 'nsis,msi'`. EXE and MSI product versions were read back as 0.0.6. The deliverables are collected in `build/ArcaX-0.0.6/` with `SHA256SUMS.txt`; copied installers match their original bundle hashes. The release destination is [ArcaX 0.0.6](https://github.com/TreeX-xx/ArcaX/releases/tag/v0.0.6); publication and asset integrity are checked against GitHub separately from the local build.

Validation passed: `node node_modules/typescript/bin/tsc --noEmit --incremental false`, `node node_modules/eslint/bin/eslint.js`, `node node_modules/vitest/vitest.mjs run --maxWorkers=2` (159 tests), `node --test .github/scripts/*.test.js` (23 tests), and `cargo test --manifest-path src-tauri/Cargo.toml --all-features --locked -j 1` (169 passed, nine external-service tests ignored). The initial concurrent full checks exhausted memory; these bounded reruns completed successfully.

Production Chromium checks ran with `node node_modules/@playwright/test/cli.js test --project=chromium --workers=2`: 49 of 51 passed initially. The two failures came from the older preview-selection fixture treating ZIP as non-previewable; that fixture now uses `.bin` for its binary-skip case, matching the existing ZIP support. All four tests in `tests/smoke/preview-selection.spec.ts` passed on the targeted rerun. No application code changed for that fixture correction. WebKit, installer execution and real Tencent COS account operations were not tested in this build.

## 0.0.7 local verification

On 2026-11-14, `node node_modules/typescript/bin/tsc --noEmit --incremental false`, `node node_modules/eslint/bin/eslint.js`, the production `pnpm build`, `node node_modules/vitest/vitest.mjs run --maxWorkers=2` (174 tests), `node --test .github/scripts/*.test.js` (23 tests) and `node node_modules/@playwright/test/cli.js test --project=chromium --workers=2` (52 tests) passed. The browser suite includes all three presets, no TOS preset, one advanced section, masked tokens, persistence and no horizontal overflow at 800/1440 px. Screenshots were inspected locally. WebKit, installer execution and real-account service operations were not run.

The final `cargo test --manifest-path src-tauri/Cargo.toml --all-features --locked -j 1` passed 174 tests; nine external-service tests were ignored. This includes the production OBS builder captured against a local HTTP fixture (production OBS validation requires HTTPS), native/provider-host presigning, token rollback/read failure/explicit clear and credential-source switching. The final `CARGO_BUILD_JOBS=1 pnpm tauri build --bundles 'nsis,msi'` completed and produced Windows x64 installers collected in `build/ArcaX-0.0.7/`. The built executable ProductVersion and MSI ProductVersion were both read back as `0.0.7`; each copied installer matches its original bundle SHA256. EXE: `55cca9cb62e73acb349d9211f7bb7474eab547d1aac8c30c56d21c23784f6506`; MSI: `6c37402cfe7109ecb4ebf7c233059454236635055feaefcad6bcc53f07eb9bda`. `SHA256SUMS.txt` accompanies the packages. 0.0.7 has not been tagged or published.

## 0.0.7 国内厂商范围与验收

用户确定 0.0.7 的方向为国产对象存储兼容。首批厂商与简洁界面约束已由用户确认；本地连接实现已落地，真实账号验收尚未执行。0.0.6 仍是已发布基线，0.0.7 未发布。本轮 xdo 不创建执行 Task。

### 厂商范围

| 优先级 | 厂商 | 0.0.7 工作范围与主要风险 |
| --- | --- | --- |
| 必做 | 腾讯云 COS | 将 0.0.6 的地域、寻址规则纳入统一机制；补真实账号与临时凭证验收。 |
| 必做 | 阿里云 OSS | S3 兼容端点、虚拟主机寻址、签名配置；优先验证账号是否允许 S3 V4 认证。ACL 和 ETag 语义须单独处理。 |
| 必做 | 华为云 OBS | 地域端点与 V4 签名；特别验证上传载荷签名、校验和、分片与临时凭证。 |
| 后续 | 七牛 Kodo | 已有官方兼容 API 清单，但部分字段不兼容，后续逐项验证。 |
| 后续 | 百度 BOS | 后续验证 S3 专用端点、地域代码、签名与 STS。 |
| 后续 | 金山云 KS3 | 后续按官方 S3 工具配置与兼容接口逐项验证。 |

火山引擎暂不考虑，不提供本轮预设。七牛、百度、金山云保留后续安排。

先复用现有 AWS Rust S3 SDK，将厂商差异集中到连接规则与功能能力描述中。厂商身份与凭证来源分开建模，统一供浏览、传输、连接检查和预签名使用；前后端规则用同一组数据样例交叉验证。原生厂商 SDK、自动申请/续期 STS、厂商 IAM 控制台、自定义域名自动配置不进入本轮范围。自定义域名和内网/加速端点保留高级手动配置；没有验证证据时不自动推断规则。阿里云 S3 认证若受账号开通条件限制，必须在第一个验证阶段明确；不得以更换地址或静默弱化签名来掩盖限制。

### 界面调整与简洁约束（用户已确认）

沿用 [Design](../../DESIGN.md) 中现有的中性配色、紧凑间距、8px 控件圆角、表单与弹窗组件。主窗口、文件表格和传输页面维持现有结构。用户要求功能和界面均保持简洁；所有新增项必须直接服务连接和实际操作，避免重复入口。

1. 复用现有连接弹窗和凭证类型选择。在“自定义 S3”模式内增加一个紧凑的厂商下拉框：自动/其他 S3、腾讯 COS、阿里 OSS、华为 OBS。粘贴标准端点时可自动识别；手动选择用于纠正推断。AWS 本地配置、环境凭证和 SSO 沿用现有入口，避免再增加一套平行的厂商首页或配置向导。
2. 复用名称、端点、密钥、地域、目标桶等现有字段。端点自动识别地域，选择厂商和地域时可填入推荐端点；已有手动值不能静默覆盖。必要提示放在字段下方的一行辅助文字，密钥标签使用厂商惯用名称。
3. 只保留一个折叠的“高级设置”，容纳寻址覆盖、必要的手动签名地域、可选 Session Token 及已有公共/CDN 配置。能由厂商规则确定的参数不要求用户重复设置。Session Token 复用密钥存储、遮罩、脱敏和清除规则，不增加自动申请/续期功能。
4. 将现有“粘贴 OBS 配置”改为“粘贴连接配置”，继续使用一个导入入口，兼容 OBS_* 并按实际需求扩展字段。冲突输入给出简短错误；导入只填表、不执行表达式，不保留粘贴原文。
5. 保留一个“测试连接”按钮和一处简短结果。成功明确说明已验证的范围，例如“目标桶可列目录”；失败给出原因和一条可操作建议。详细技术信息按需展开，不增加常驻分步诊断面板、多个测试按钮或能力状态仪表盘。修改连接参数后清除旧测试结果。
6. 功能受限时在现有操作位置说明原因；确定不支持的操作才禁用，无权限与不支持要准确区分。能力判断留在内部，不为每个功能增加四态标签、厂商徽章或状态管理页面。复用已有错误与重试交互。

### 功能收敛

0.0.7 聚焦现有功能在三家厂商下可靠工作。厂商规则集中在连接层，功能差异按实际用例处理；暂不建立通用插件框架、云账号管理中心、独立兼容性仪表盘、全量自动能力扫描或额外操作历史。临时凭证与配置导入作为连接表单的小幅补充，避免形成新的产品流程。

### 功能边界与验收

- 基础功能必须按厂商验证：指定桶浏览、分页与中文/空格/特殊字符键名；上传、下载、取消和重试；超过现有 100 MiB 阈值的分片上传及失败后的 abort；预签名 GET/Range、图片/文本/ZIP 等依赖路径；同桶复制、删除和公开链接格式。
- 另行验证跨厂商复制、同步及编辑保存的条件写入。ETag 作为服务端版本标识保留原值，不跨厂商假定等于 MD5；若不能可靠执行冲突保护，相应覆盖/同步写入功能必须明确限制，禁止退化为无条件写入。
- ACL、版本历史/恢复、桶策略和建桶不承诺 AWS 全量对等。每项有厂商证据与实际行为记录，缺失支持显示明确限制；无权限和未验证单独报告。
- 每家准备一个获授权的隔离测试桶，以唯一测试前缀执行读写、分片、临时凭证、受限账号、超时和清理验证。普通连接测试保持只读；写入和删除只在明确的验收步骤中执行，并记录残留清理结果。
- 新旧 Profile 往返保存、空密钥编辑、秘密存储和配置缓存失效必须回归；AWS、MinIO、R2 的既有行为纳入回归，不因新增厂商而改坏通用模式。
- 每家只有在核心用例真实跑通后才标为“已验证兼容”。没有账号、权限或可用测试桶的厂商必须写明未验证，不能用本地 mock 通过代替真实验收。

### 执行顺序

| 阶段 | 交付与当前状态 |
| --- | --- |
| 1. 协议摸底 | 已核对官方地域端点、OSS S3 认证条件、OBS V4 载荷与校验和规则；账号开通条件未实测。 |
| 2. 统一连接机制 | 本地实现完成；厂商规则、Session Token、旧配置和请求级回归通过。 |
| 3. 连接界面 | 完成厂商选择、端点联动、通用粘贴和单一高级设置；Chromium 交互回归通过。 |
| 4. 云端验证 | 未执行；仍需三家获授权隔离桶及测试凭证，按上述固定用例形成证据。 |
| 5. 构建与发布 | 使用说明、兼容矩阵、自动回归及 Windows x64 0.0.7 EXE/MSI 构建和哈希校验完成；未打 tag 或发布 release。 |

云端验收仍需落实三家的获授权隔离测试桶、账号权限与临时凭证来源；当前未提供这些条件，未读取本机真实凭证或发起真实云端写入。腾讯 COS、阿里 OSS、华为 OBS 为用户已确认的本轮范围，后续三家不作为 0.0.7 发布门槛；实际受阻时应明确报告并重新确认范围。

### 官方依据（2026-11-14 核对）

- [腾讯云：使用 AWS S3 SDK 访问 COS](https://cloud.tencent.com/document/product/436/37421)
- [阿里云：OSS 与 S3 兼容性差异](https://help.aliyun.com/zh/oss/developer-reference/compatibility-with-amazon-s3)
- [阿里云：使用 AWS SDK 访问 OSS](https://help.aliyun.com/zh/oss/developer-reference/use-aws-sdks-to-access-oss)
- [阿里云：S3 V4 认证未开启的错误说明](https://help.aliyun.com/en/oss/user-guide/0002-00000033)
- [华为云：如何使用 V4 签名访问 OBS](https://support.huaweicloud.com/obs_faq/obs_faq_0274.html)
- [七牛：兼容 API](https://developer-doc.qiniu.com/products/kodo/development-guidelines/aws-s3-compatible/compatible-s3-api)
- [百度：兼容签名认证](https://cloud.baidu.com/doc/BOS/s/Hjwvyq84s)
- [金山云：S3 Browser 配置](https://docs.ksyun.com/documents/42569)
