import type { ArchiveEntry } from '@/lib/tauri';

export interface ArchiveRow {
  kind: 'dir' | 'file';
  name: string;
  path: string;
  entry?: ArchiveEntry;
  size: number;
  compressedSize: number;
  modified: string | null;
  method: string;
  unsafe: boolean;
}

const dirPrefix = (prefix: string): string => {
  const normalized = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized ? `${normalized}/` : '';
};

/**
 * Turn a flat archive listing into the rows visible at one folder level.
 * Directory rows aggregate the sizes of every entry below them so users can
 * judge a folder before opening it.
 */
export function buildArchiveRows(
  entries: ArchiveEntry[],
  prefix: string,
  filter: string
): ArchiveRow[] {
  const currentPrefix = dirPrefix(prefix);
  const directories = new Map<string, { size: number; compressedSize: number; unsafe: boolean }>();
  const files: ArchiveRow[] = [];

  for (const entry of entries) {
    if (currentPrefix && !entry.path.startsWith(currentPrefix)) continue;
    const remainder = entry.path.slice(currentPrefix.length);
    if (!remainder) continue;

    const firstSlash = remainder.indexOf('/');
    const firstSegment = firstSlash >= 0 ? remainder.slice(0, firstSlash) : remainder;
    const isNested = firstSlash >= 0 && firstSegment !== '..';

    if (isNested || (entry.is_dir && firstSegment !== '..')) {
      const aggregate = directories.get(firstSegment) ?? {
        size: 0,
        compressedSize: 0,
        unsafe: false,
      };
      aggregate.size += entry.size;
      aggregate.compressedSize += entry.compressed_size;
      aggregate.unsafe = aggregate.unsafe || entry.unsafe_path;
      directories.set(firstSegment, aggregate);
      continue;
    }

    if (entry.is_dir) continue;

    files.push({
      kind: 'file',
      name: firstSegment === '..' ? remainder : firstSegment,
      path: entry.path,
      entry,
      size: entry.size,
      compressedSize: entry.compressed_size,
      modified: entry.modified,
      method: entry.method,
      unsafe: entry.unsafe_path || entry.encrypted || entry.is_symlink,
    });
  }

  const rows: ArchiveRow[] = [
    ...Array.from(directories.entries()).map(([name, aggregate]) => ({
      kind: 'dir' as const,
      name,
      path: `${currentPrefix}${name}/`,
      size: aggregate.size,
      compressedSize: aggregate.compressedSize,
      modified: null,
      method: '',
      unsafe: aggregate.unsafe,
    })),
    ...files,
  ];

  const query = filter.trim().toLowerCase();
  const filtered = query
    ? rows.filter((row) => row.name.toLowerCase().includes(query))
    : rows;
  return filtered.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}
