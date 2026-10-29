import { test, expect } from './fixtures';

// Window controls are Windows-only; keep the suite portable.
test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });

test('desktop sidebar releases space and window controls invoke native actions', async ({ page, backend }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation).toBeVisible();
  const main = page.getByRole('main');
  const initial = await main.boundingBox();
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(navigation).toBeHidden();
  const expanded = await main.boundingBox();
  expect(expanded!.width - initial!.width).toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toBeVisible();
  for (const name of ['Minimize window', 'Maximize or restore window', 'Close window']) {
    await page.getByRole('button', { name, exact: true }).click();
  }
  expect(backend.calls
    .filter(call => ['plugin:window|minimize', 'plugin:window|toggle_maximize', 'plugin:window|close'].includes(call.command))
    .map(call => call.command))
    .toEqual(['plugin:window|minimize', 'plugin:window|toggle_maximize', 'plugin:window|close']);
});

test('empty workspace opens connection dialog and keeps settings available', async ({ page, backend }) => {
  backend.profiles = [];
  backend.activeProfile = '';
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect account' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('navigation').getByText('Settings', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Theme: dark' }).click();
  await expect(page.getByRole('button', { name: 'Theme: system' })).toBeVisible();
  await page.getByRole('button', { name: 'Theme: system' }).click();
  await expect(page.getByRole('button', { name: 'Theme: light' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
