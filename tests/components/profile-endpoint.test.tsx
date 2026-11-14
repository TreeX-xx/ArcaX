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
  const input = await screen.findByRole('textbox', { name: 'Paste OBS configuration' });
  fireEvent.paste(input, { clipboardData: { getData: () => 'OBS_ENDPOINT_URL: "https://cos.ap-guangzhou.myqcloud.com"\nOBS_ACCESS_KEY: "example-access"\nOBS_SECRET_KEY: "example-secret"\nOBS_BUCKET: "example-1250000000"' } });
  expect((input as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Secret Access Key') as HTMLInputElement).type).toBe('password');
  expect((screen.getByLabelText('Secret Access Key') as HTMLInputElement).value).toBe('example-secret');
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
