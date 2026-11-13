import type { SqliteCell, SqliteProbeDecision } from '@/lib/tauri';

export type SqlitePreviewRoute = 'sqlite' | 'too-large' | 'text';

/**
 * What the existing text preview should do after the backend has looked at
 * the file header. Fallback keeps today's Monaco path. SQLite never does.
 */
export function routeTextPreview(decision: SqliteProbeDecision): SqlitePreviewRoute {
  switch (decision) {
    case 'sqlite':
      return 'sqlite';
    case 'too_large':
      return 'too-large';
    case 'fallback':
      return 'text';
  }
}

export function sqliteCellLabel(
  cell: Pick<SqliteCell, 'kind' | 'text'>,
  t: (message: string, vars?: Record<string, string | number>) => string,
): string {
  if (cell.kind === 'null') return t('NULL');
  if (cell.kind === 'blob') return t('BLOB ({size} bytes)', { size: cell.text });
  return cell.text;
}
