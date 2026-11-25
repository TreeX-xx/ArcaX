// Capture README screenshots from the static build using the same browser-side
// Tauri mock that the smoke tests use.
//
// Usage:
//   pnpm build
//   node scripts/capture-readme-screenshots.mjs
//
// Output: docs/screenshots/*.png and docs/screenshots/zh-CN/*.png

import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'docs', 'screenshots');
const port = Number(process.env.SCREENSHOT_PORT || 4179);
const baseUrl = `http://127.0.0.1:${port}`;
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const locales = [
  {
    locale: 'en-US', language: 'en', directory: outDir,
    allBuckets: 'All Buckets', settings: 'Settings', explorer: 'Explorer', activeProfile: 'Active profile',
    profileName: 'Media archive',
    storageProvider: 'Storage provider', providers: ['Tencent COS', 'Alibaba OSS', 'Huawei OBS'],
  },
  {
    locale: 'zh-CN', language: 'zh', directory: path.join(outDir, 'zh-CN'),
    allBuckets: '所有存储桶', settings: '设置', explorer: '浏览', activeProfile: '当前配置',
    profileName: '媒体归档',
    storageProvider: '存储厂商', providers: ['腾讯云 COS', '阿里云 OSS', '华为云 OBS'],
  },
];

try {
  await access(path.join(root, 'out', 'index.html'));
} catch {
  console.error('Missing out/index.html. Run `pnpm build` first.');
  process.exit(1);
}

const server = spawn(process.execPath, ['tests/smoke/server.mjs'], {
  cwd: root,
  env: { ...process.env, SMOKE_PORT: String(port) },
  stdio: 'ignore',
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Static server did not start');
}

function mockTauri({ locale, profileName, version }) {
  const profiles = [
    { id: 'production', name: 'Production S3', credential_type: { type: 'Environment' }, region: 'us-east-1', is_default: true },
    { id: 'r2', name: 'Cloudflare R2', credential_type: { type: 'AccessKey' }, region: 'auto', is_default: false },
    {
      id: 'cos',
      name: profileName,
      credential_type: {
        type: 'CustomEndpoint',
        endpoint_url: 'https://cos.ap-guangzhou.myqcloud.com',
        access_key_id: '',
        secret_access_key: '',
      },
      provider: 'cos',
      region: 'ap-guangzhou',
      default_bucket: 'media-archive-1250000000',
      is_default: false,
    },
  ];
  const buckets = [
    { name: 'media-production', region: 'us-east-1', creation_date: '2025-11-04T09:12:00Z', object_count: 1284, total_size: 734003200, total_size_formatted: '700.0 MB' },
    { name: 'backups-archive', region: 'eu-west-1', creation_date: '2025-06-18T14:03:00Z', object_count: 9502, total_size: 120758708224, total_size_formatted: '112.4 GB' },
    { name: 'logs-observability', region: 'us-west-2', creation_date: '2025-08-27T08:41:00Z', object_count: 41208, total_size: 9234179686, total_size_formatted: '8.6 GB' },
    { name: 'website-assets', region: 'ap-southeast-1', creation_date: '2026-01-12T16:22:00Z', object_count: 356, total_size: 1288490189, total_size_formatted: '1.2 GB' },
    { name: 'r2-customer-uploads', region: 'auto', creation_date: '2026-02-03T11:08:00Z', object_count: 2041, total_size: 20078972109, total_size_formatted: '18.7 GB' },
  ];
  const now = Date.now();
  const objects = [
    { key: 'app.css', size: 98176, last_modified: '2026-05-22T10:14:00Z', storage_class: 'STANDARD' },
    { key: 'catalog.json', size: 34816, last_modified: '2026-05-22T10:12:00Z', storage_class: 'STANDARD' },
    { key: 'getting-started.pdf', size: 1047552, last_modified: '2026-05-17T09:30:00Z', storage_class: 'STANDARD' },
    { key: 'hero-banner.png', size: 1887436, last_modified: '2026-05-22T10:09:00Z', storage_class: 'STANDARD' },
    { key: 'video-preview.mp4', size: 18245222, last_modified: '2026-05-19T15:47:00Z', storage_class: 'STANDARD' },
  ];
  const folders = ['documents/', 'fonts/', 'images/'];
  const folderTimestamps = {
    'documents/': '2026-05-18T12:20:00Z',
    'fonts/': '2026-04-02T07:15:00Z',
    'images/': '2026-05-22T10:09:00Z',
  };
  const transfers = [
    { id: 'upload-1', profile_id: 'production', transfer_type: 'Upload', bucket: 'media-production', bucket_region: 'us-east-1', key: 'images/hero-banner.png', local_path: '/Users/tree/Design/hero-banner.png', total_bytes: 1887436, processed_bytes: 1363148, bytes_per_second: 2202009, status: 'InProgress', phase: 'Uploading', created_at: now - 120000 },
    { id: 'upload-2', profile_id: 'production', transfer_type: 'Upload', bucket: 'r2-customer-uploads', bucket_region: 'auto', key: 'imports/customer-import.csv', local_path: '/Users/tree/Exports/customer-import.csv', total_bytes: 911360, processed_bytes: 0, status: 'Pending', created_at: now - 60000 },
    { id: 'upload-3', profile_id: 'production', transfer_type: 'Upload', bucket: 'website-assets', bucket_region: 'ap-southeast-1', key: 'scripts/app.js', local_path: '/Users/tree/Website/scripts/app.js', total_bytes: 642048, processed_bytes: 642048, status: 'Completed', created_at: now - 360000, finished_at: now - 315000 },
  ];

  const callbacks = new Map();
  let nextId = 0;
  const invoke = (command, args = {}) => {
    switch (command) {
      case 'plugin:app|version': return version;
      case 'plugin:event|listen': return args.handler;
      case 'plugin:event|unlisten': callbacks.delete(Number(args.eventId)); return null;
      case 'plugin:event|emit': return null;
      case 'plugin:path|resolve_directory': return '/virtual/config';
      case 'plugin:updater|check': return null;
      case 'plugin:clipboard-manager|write_text': return null;
      case 'plugin:window|is_maximized': return false;
      case 'plugin:window|minimize':
      case 'plugin:window|toggle_maximize':
      case 'plugin:window|close': return null;
      case 'plugin:dialog|save': return '/virtual/downloads/object.bin';
      case 'plugin:dialog|open': return args.options?.directory ? '/virtual/downloads' : ['/virtual/upload.bin'];
      case 'plugin:os|locale': return locale;
      case 'get_log_file_info': return { log_file_path: '/virtual/logs/arcax.log', log_dir_path: '/virtual/logs', panic_log_path: '/virtual/logs/panic.log', panic_log_exists: false };
      case 'list_profiles': return profiles;
      case 'get_profile': return profiles.find(profile => profile.id === args.id) ?? null;
      case 'get_active_profile': return profiles[0];
      case 'set_active_profile': return null;
      case 'discover_local_profiles': return [];
      case 'check_aws_environment': return { has_access_key: true, has_secret_key: true, has_session_token: false, region: 'us-east-1' };
      case 'list_buckets':
      case 'list_buckets_with_regions': return buckets;
      case 'get_bucket_region': return 'us-east-1';
      case 'get_prefix_timestamps': return (args.prefixes ?? []).map(prefix => ({ prefix, last_modified: folderTimestamps[prefix] ?? null }));
      case 'list_objects': {
        const prefix = String(args.prefix ?? '');
        if (prefix) {
          return { objects: [], common_prefixes: [], next_continuation_token: null, is_truncated: false, prefix, bucket_region: 'us-east-1' };
        }
        return { objects, common_prefixes: folders, next_continuation_token: null, is_truncated: false, prefix: '', bucket_region: 'us-east-1' };
      }
      case 'search_objects': {
        const query = String(args.query ?? '').toLowerCase();
        return { objects: objects.filter(item => item.key.toLowerCase().includes(query)), scanned_objects: objects.length, is_truncated: false };
      }
      case 'get_bucket_policy': return null;
      case 'list_transfers': return transfers;
      case 'list_saved_jobs': return [];
      case 'refresh_s3_client':
      case 'set_transfer_concurrency':
      case 'set_transfer_bandwidth': return null;
      default:
        if (window.__unmockedArcaXCalls) window.__unmockedArcaXCalls.push(command);
        return null;
    }
  };

  window.__unmockedArcaXCalls = [];
  Object.assign(window, {
    __TAURI__: {},
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
    __TAURI_INTERNALS__: {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: callback => { callbacks.set(++nextId, callback); return nextId; },
      unregisterCallback: id => callbacks.delete(id),
      invoke: (command, args) => Promise.resolve(invoke(command, args)),
    },
  });
}

async function captureLocale(browser, labels) {
  const { directory, locale, language, profileName } = labels;
  await mkdir(directory, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    locale,
  });
  try {
    await context.addInitScript(mockTauri, { locale, profileName, version });
    await context.addInitScript(language => {
      localStorage.setItem('arcax-app-v2', JSON.stringify({ state: { themeMode: 'light' }, version: 0 }));
      localStorage.setItem('arcax-settings', JSON.stringify({ state: { language }, version: 1 }));
    }, language);
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));

    const page = await context.newPage();
    page.on('pageerror', error => console.error('page error:', error.message));

    async function save(file, clip) {
      const html = page.locator('html');
      await expect(html).toHaveAttribute('lang', language === 'zh' ? locale : language);
      await expect(html).toHaveCSS('color-scheme', 'light');
      // Keep the portaled provider menu, but omit the dimmed page behind the rounded dialog.
      const style = clip ? `
        html, body { background: transparent !important; }
        body * { visibility: hidden !important; }
        [role="dialog"], [role="dialog"] *, .MuiMenu-paper, .MuiMenu-paper * { visibility: visible !important; }
        [role="dialog"] { box-shadow: none !important; }
      ` : undefined;
      await page.screenshot({ path: path.join(directory, file), clip, style, omitBackground: !!clip, animations: 'disabled' });
      console.log(`captured ${locale} ${file}`);
    }

    async function capture(route, file, expectedText) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      await page.getByText(expectedText, { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
      await expect(page.getByRole('tab', { name: labels.explorer, exact: true })).toBeVisible();
      await save(file);
    }

    await capture('/?view=discovery', 'all-buckets.png', labels.allBuckets);
    await capture('/bucket?name=media-production&region=us-east-1', 'object-browser.png', 'hero-banner.png');
    await capture('/uploads', 'uploads.png', 'hero-banner.png');
    await capture('/settings', 'settings.png', labels.settings);

    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.getByRole('combobox', { name: labels.activeProfile }).click();
    await page.getByRole('option').filter({ hasText: profileName }).getByRole('button').click();
    const dialog = page.getByRole('dialog');
    const provider = dialog.getByRole('combobox', { name: labels.storageProvider });
    await expect(provider).toHaveText(labels.providers[0]);
    const clip = await dialog.boundingBox();
    if (!clip) throw new Error('The connection dialog is not visible');
    await provider.click();
    for (const name of labels.providers) {
      await expect(page.getByRole('option', { name, exact: true })).toBeVisible();
    }
    await save('s3-providers.png', clip);
  } finally {
    await context.close();
  }
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  try {
    for (const labels of locales) await captureLocale(browser, labels);
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
