// Capture README screenshots from the static build using the same browser-side
// Tauri mock that the smoke tests use.
//
// Usage:
//   pnpm build
//   node scripts/capture-readme-screenshots.mjs
//
// Output: docs/screenshots/*.png

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'docs', 'screenshots');
const port = Number(process.env.SCREENSHOT_PORT || 4179);
const baseUrl = `http://127.0.0.1:${port}`;

try {
  await access(path.join(root, 'out', 'index.html'));
} catch {
  console.error('Missing out/index.html. Run `pnpm build` first.');
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

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

function mockTauri() {
  const profiles = [
    { id: 'production', name: 'Production S3', credential_type: { type: 'Environment' }, region: 'us-east-1', is_default: true },
    { id: 'r2', name: 'Cloudflare R2', credential_type: { type: 'AccessKey' }, region: 'auto', is_default: false },
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
      case 'plugin:app|version': return '0.0.2';
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
      case 'plugin:os|locale': return 'en-US';
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

await waitForServer();

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  locale: 'en-US',
});
await context.addInitScript(mockTauri);
await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));

const page = await context.newPage();
page.on('pageerror', error => console.error('page error:', error.message));

async function capture(route, file, expectedText) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
  await page.getByText(expectedText, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, file) });
  console.log(`captured ${file}`);
}

try {
  await capture('/?view=discovery', 'all-buckets.png', 'media-production');
  await capture('/bucket?name=media-production&region=us-east-1', 'object-browser.png', 'hero-banner.png');
  await capture('/uploads', 'uploads.png', 'hero-banner.png');
  await capture('/settings', 'settings.png', 'Settings');
} finally {
  await browser.close();
  server.kill();
}
