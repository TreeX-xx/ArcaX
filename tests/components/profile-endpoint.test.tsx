import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import ProfileDialog from '@/components/profile/ProfileDialog';
import { profileApi, type Profile } from '@/lib/tauri';
import { useProfileStore } from '@/store/profileStore';
import { useSettingsStore } from '@/store/settingsStore';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/tauri', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/tauri')>(),
  profileApi: { discoverLocalProfiles: vi.fn(), checkAwsEnvironment: vi.fn(), testConnection: vi.fn(), updateProfile: vi.fn() },
}));

const profile: Profile = { id: 'cos', name: 'COS', credential_type: { type: 'CustomEndpoint', endpoint_url: 'http://localhost:9000', access_key_id: 'old-access', secret_access_key: '' }, region: 'us-east-1', is_default: false };

beforeEach(() => {
  useSettingsStore.setState({ language: 'en' });
  useProfileStore.setState({ profiles: [profile], activeProfileId: null });
  vi.mocked(profileApi.discoverLocalProfiles).mockResolvedValue([]);
  vi.mocked(profileApi.checkAwsEnvironment).mockResolvedValue({ has_access_key: false, has_secret_key: false, has_session_token: false });
  vi.mocked(profileApi.testConnection).mockResolvedValue({ success: true, message: 'Target bucket is accessible. Listing permission verified.' });
  vi.mocked(profileApi.updateProfile).mockImplementation(async (_id, updated) => updated as Profile);
});

test('pasting OBS config fills masked credentials, detects COS, and tests the target bucket', async () => {
  render(<ProfileDialog open onClose={vi.fn()} editProfile={profile} />);
  const input = await screen.findByRole('textbox', { name: 'Paste connection configuration' });
  fireEvent.paste(input, { clipboardData: { getData: () => 'OBS_ENDPOINT_URL: "https://cos.ap-guangzhou.myqcloud.com"\nOBS_ACCESS_KEY: "example-access"\nOBS_SECRET_KEY: "example-secret"\nOBS_BUCKET: "example-1250000000"' } });
  expect((input as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Secret Key') as HTMLInputElement).type).toBe('password');
  expect((screen.getByLabelText('Secret Key') as HTMLInputElement).value).toBe('example-secret');
  expect((screen.getByRole('combobox', { name: 'Default Region' }) as HTMLInputElement).value).toBe('ap-guangzhou');
  expect((screen.getByRole('textbox', { name: 'Target bucket (optional)' }) as HTMLInputElement).value).toBe('example-1250000000');
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
  await screen.findByText('Target bucket is accessible. Listing permission verified.');
  expect(profileApi.testConnection).toHaveBeenCalledWith(expect.objectContaining({
    default_bucket: 'example-1250000000', addressing_style: 'auto', region: 'ap-guangzhou',
    credential_type: expect.objectContaining({ endpoint_url: 'https://cos.ap-guangzhou.myqcloud.com', secret_access_key: 'example-secret' }),
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Update Profile' }));
  await waitFor(() => expect(profileApi.updateProfile).toHaveBeenCalledWith('cos', expect.objectContaining({ default_bucket: 'example-1250000000', addressing_style: 'auto' })));
});

test('an older COS profile displays its endpoint region without recreating credentials', async () => {
  render(<ProfileDialog open onClose={vi.fn()} editProfile={{ ...profile, credential_type: { ...profile.credential_type, type: 'CustomEndpoint', endpoint_url: 'https://cos.ap-guangzhou.myqcloud.com', access_key_id: 'old-access', secret_access_key: '' } }} />);
  expect((await screen.findByRole('combobox', { name: 'Default Region' }) as HTMLInputElement).value).toBe('ap-guangzhou');
  expect((screen.getByRole('textbox', { name: 'Endpoint URL' }) as HTMLInputElement).value).toBe('https://cos.ap-guangzhou.myqcloud.com');
});

test('OSS import carries a masked token, keeps one result and clears stale results', async () => {
  render(<ProfileDialog open onClose={vi.fn()} editProfile={profile} />);
  fireEvent.paste(await screen.findByRole('textbox', { name: 'Paste connection configuration' }), { clipboardData: { getData: () => 'OSS_ENDPOINT=s3.oss-cn-hangzhou.aliyuncs.com\nOSS_ACCESS_KEY_ID=example\nOSS_ACCESS_KEY_SECRET=secret\nOSS_SECURITY_TOKEN=temporary' } });
  expect(screen.queryByRole('combobox', { name: 'Addressing style' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Advanced settings' }));
  const token = screen.getByLabelText('Session token (optional)') as HTMLInputElement;
  expect(token.type).toBe('password');
  expect(token.value).toBe('temporary');
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
  await screen.findByText('Target bucket is accessible. Listing permission verified.');
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(profileApi.testConnection).toHaveBeenCalledWith(expect.objectContaining({ session_token: 'temporary', region: 'cn-hangzhou' }));
  fireEvent.change(token, { target: { value: 'replacement' } });
  await waitFor(() => expect(screen.queryByText('Target bucket is accessible. Listing permission verified.')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Update Profile' }));
  await waitFor(() => expect(profileApi.updateProfile).toHaveBeenCalledWith('cos', expect.objectContaining({ session_token: 'replacement' })));
});

test('saved token stays omitted until explicitly cleared', async () => {
  render(<ProfileDialog open onClose={vi.fn()} editProfile={{ ...profile, has_session_token: true }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Test Connection' }));
  await waitFor(() => expect(profileApi.testConnection).toHaveBeenCalledWith(expect.objectContaining({ session_token: undefined })));
  fireEvent.click(screen.getByRole('button', { name: 'Advanced settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear saved token' }));
  fireEvent.click(screen.getByRole('button', { name: 'Update Profile' }));
  await waitFor(() => expect(profileApi.updateProfile).toHaveBeenCalledWith('cos', expect.objectContaining({ session_token: '' })));
});

test('provider choice fills a regional endpoint and preserves a manual endpoint', async () => {
  render(<ProfileDialog open onClose={vi.fn()} editProfile={{ ...profile, credential_type: { type: 'CustomEndpoint', endpoint_url: '', access_key_id: 'example', secret_access_key: '' } }} />);
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Storage provider' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Alibaba OSS' }));
  const endpoint = screen.getByRole('textbox', { name: 'Endpoint URL' }) as HTMLInputElement;
  expect(endpoint.value).toBe('https://s3.oss-cn-hangzhou.aliyuncs.com');
  fireEvent.change(endpoint, { target: { value: 'https://storage.example.com' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Storage provider' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Huawei OBS' }));
  expect(endpoint.value).toBe('https://storage.example.com');
});
