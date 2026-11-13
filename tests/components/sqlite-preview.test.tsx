import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import ObjectPreviewDialog from '@/components/dialogs/ObjectPreviewDialog';
import { objectApi, sqliteApi } from '@/lib/tauri';

vi.mock('@/lib/tauri', () => ({
  objectApi: { getObjectMetadata: vi.fn(), getObjectContent: vi.fn(), putObjectContent: vi.fn() },
  sqliteApi: { probe: vi.fn(), listTables: vi.fn(), readTable: vi.fn() },
  copyToClipboard: vi.fn(),
}));
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) => <textarea aria-label="File content" value={value} readOnly />,
}));

const catalog = {
  byte_size: 4096,
  truncated: false,
  tables: [
    { name: 'mill', kind: 'table', row_count: 150 },
    { name: 'drill', kind: 'table', row_count: 1 },
  ],
};

const page = (offset: number) => ({
  name: 'mill',
  kind: 'table',
  columns: [
    { name: 'name', declared_type: 'TEXT' },
    { name: 'notes', declared_type: 'BLOB' },
  ],
  rows: [[
    { kind: 'text', text: offset === 0 ? 'endmill' : 'page-two' },
    { kind: offset === 0 ? 'null' : 'blob', text: offset === 0 ? '' : '4' },
  ]],
  total_rows: 150,
  offset,
  limit: 100,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(objectApi.getObjectMetadata).mockResolvedValue({
    key: 'toolDB',
    size: 4096,
    content_type: 'application/octet-stream',
    e_tag: 'etag',
    last_modified: null,
    storage_class: null,
    user_metadata: {},
  });
  vi.mocked(objectApi.getObjectContent).mockResolvedValue({ content: 'should-not-render', e_tag: 'etag', profile_id: 'profile-a' });
  vi.mocked(sqliteApi.listTables).mockResolvedValue(catalog);
  vi.mocked(sqliteApi.readTable).mockImplementation(async (_bucket, _region, _key, _table, offset) => page(offset));
});

test('an extensionless toolDB opens as paged tables and never as Monaco text', async () => {
  vi.mocked(sqliteApi.probe).mockResolvedValue({ decision: 'sqlite', size: 4096 });
  render(<ObjectPreviewDialog open onClose={vi.fn()} bucketName="bucket" bucketRegion="region" objectKey="libraries/toolDB" />);

  expect(await screen.findByRole('table', { name: 'mill' })).toBeTruthy();
  expect(screen.getByText('endmill')).toBeTruthy();
  expect(screen.getByText('NULL')).toBeTruthy();
  expect(screen.getByRole('option', { name: /drill/ })).toBeTruthy();
  expect(screen.queryByRole('textbox', { name: 'File content' })).toBeNull();
  expect(objectApi.getObjectContent).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
  await waitFor(() => expect(sqliteApi.readTable).toHaveBeenLastCalledWith(
    'bucket',
    'region',
    'libraries/toolDB',
    'mill',
    100,
    100,
  ));
  expect(await screen.findByText('page-two')).toBeTruthy();
  expect(screen.getByText('BLOB (4 bytes)')).toBeTruthy();
});

test('a non-sqlite text file still opens in the editor after the header does not match', async () => {
  vi.mocked(sqliteApi.probe).mockResolvedValue({ decision: 'fallback', size: 4 });
  vi.mocked(objectApi.getObjectMetadata).mockResolvedValue({
    key: 'notes.txt',
    size: 4,
    content_type: 'text/plain',
    e_tag: 'etag',
    last_modified: null,
    storage_class: null,
    user_metadata: {},
  });
  vi.mocked(objectApi.getObjectContent).mockResolvedValue({ content: 'note', e_tag: 'etag', profile_id: 'profile-a' });
  render(<ObjectPreviewDialog open onClose={vi.fn()} bucketName="bucket" bucketRegion="region" objectKey="notes.txt" />);

  const editor = await screen.findByRole('textbox', { name: 'File content' });
  expect((editor as HTMLTextAreaElement).value).toBe('note');
  expect(sqliteApi.listTables).not.toHaveBeenCalled();
  expect(screen.queryByRole('table', { name: 'mill' })).toBeNull();
});

test('an oversized SQLite file shows the size limit and does not open as text', async () => {
  vi.mocked(sqliteApi.probe).mockResolvedValue({ decision: 'too_large', size: 80 * 1024 * 1024 });
  render(<ObjectPreviewDialog open onClose={vi.fn()} bucketName="bucket" bucketRegion="region" objectKey="libraries/toolDB" />);

  expect(await screen.findByText(/too large to preview/)).toBeTruthy();
  expect(screen.queryByRole('textbox', { name: 'File content' })).toBeNull();
  expect(objectApi.getObjectContent).not.toHaveBeenCalled();
  expect(sqliteApi.listTables).not.toHaveBeenCalled();
});
