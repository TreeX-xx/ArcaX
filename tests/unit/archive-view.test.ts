import { describe, expect, test } from 'vitest';
import { buildArchiveRows } from '@/lib/archiveView';
import type { ArchiveEntry } from '@/lib/tauri';

const entry = (overrides: Partial<ArchiveEntry>): ArchiveEntry => ({
  id: 0,
  path: 'entry.txt',
  raw_path: 'entry.txt',
  is_dir: false,
  size: 0,
  compressed_size: 0,
  modified: null,
  method: 'Stored',
  encrypted: false,
  is_symlink: false,
  unsafe_path: false,
  ...overrides,
});

describe('buildArchiveRows', () => {
  const entries: ArchiveEntry[] = [
    entry({ id: 0, path: 'nested/', raw_path: 'nested/', is_dir: true }),
    entry({ id: 1, path: 'nested/data.json', raw_path: 'nested/data.json', size: 12, compressed_size: 8 }),
    entry({ id: 2, path: 'root.txt', raw_path: 'root.txt', size: 5, compressed_size: 5 }),
    entry({ id: 3, path: '../evil.txt', raw_path: '../evil.txt', size: 4, compressed_size: 4, unsafe_path: true }),
  ];

  test('shows directories before files at the current level', () => {
    const rows = buildArchiveRows(entries, '', '');
    expect(rows.map((row) => `${row.kind}:${row.name}`)).toEqual([
      'dir:nested',
      'file:../evil.txt',
      'file:root.txt',
    ]);
    expect(rows[0].size).toBe(12);
    expect(rows[1].unsafe).toBe(true);
  });

  test('navigates into a directory prefix', () => {
    const rows = buildArchiveRows(entries, 'nested/', '');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'file', name: 'data.json', path: 'nested/data.json' });
  });

  test('keeps empty explicit directories visible', () => {
    const rows = buildArchiveRows([entry({ id: 0, path: 'empty/', raw_path: 'empty/', is_dir: true })], '', '');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'dir', name: 'empty' });
  });

  test('filters by the visible row name', () => {
    const rows = buildArchiveRows(entries, '', 'root');
    expect(rows.map((row) => row.name)).toEqual(['root.txt']);
  });
});
