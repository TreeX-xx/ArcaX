import { test, expect } from './fixtures';

test('domestic connection presets keep a compact form and one advanced section', async ({ page, backend }) => {
  backend.profiles[0].credential_type = { type: 'CustomEndpoint', endpoint_url: 'http://localhost:9000', access_key_id: 'example', secret_access_key: '' };
  await page.goto('/bucket?name=demo-bucket&region=us-east-1');
  await page.getByRole('combobox').filter({ hasText: 'Development' }).click();
  await page.getByRole('option', { name: /Development/ }).getByRole('button').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Test Connection', exact: true })).toHaveCount(1);
  await expect(dialog.getByLabel('Session token (optional)')).toBeHidden();
  for (const [name, endpoint] of [
    ['Tencent COS', 'https://cos.ap-guangzhou.myqcloud.com'],
    ['Alibaba OSS', 'https://s3.oss-cn-hangzhou.aliyuncs.com'],
    ['Huawei OBS', 'https://obs.cn-north-4.myhuaweicloud.com'],
  ]) {
    await dialog.getByLabel('Endpoint URL', { exact: true }).fill('');
    await dialog.getByRole('combobox', { name: 'Storage provider' }).click();
    await expect(page.getByRole('option', { name: /TOS|Volcano|火山/ })).toHaveCount(0);
    await page.getByRole('option', { name, exact: true }).click();
    await expect(dialog.getByLabel('Endpoint URL', { exact: true })).toHaveValue(endpoint);
  }
  await dialog.getByRole('button', { name: 'Advanced settings' }).click();
  await expect(dialog.getByLabel('Session token (optional)')).toHaveAttribute('type', 'password');
  await expect(dialog.getByRole('combobox', { name: 'Addressing style' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Public URLs and CDN (optional)' })).toHaveCount(0);
  for (const width of [800, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (process.env.CAPTURE_DOMESTIC_UI) await page.screenshot({ path: `build/domestic-connection-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  await dialog.getByRole('button', { name: 'Update Profile' }).click();
  await expect(dialog).toHaveCount(0);
  expect(backend.profiles[0].provider).toBe('obs');
});
