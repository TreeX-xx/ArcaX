import { expect, test } from 'vitest';
import { canObjectBePreviewed, getObjectKind } from '@/lib/objectCapabilities';
import { routeTextPreview, sqliteCellLabel } from '@/lib/sqlitePreview';

const identity = (message: string, vars?: Record<string, string | number>) => {
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
};

test('header decisions route SQLite away from the text editor and leave other files on the text path', () => {
  expect(routeTextPreview('sqlite')).toBe('sqlite');
  expect(routeTextPreview('too_large')).toBe('too-large');
  expect(routeTextPreview('fallback')).toBe('text');

  for (const name of ['toolDB', 'library.db', 'library.sqlite', 'library.sqlite3', 'notes.txt']) {
    expect(getObjectKind(name, null)).toBe('text');
    expect(canObjectBePreviewed(name, null)).toBe(true);
  }
  expect(getObjectKind('bundle.zip', 'application/zip')).toBe('archive');
  expect(getObjectKind('photo.png', null)).toBe('image');
  expect(getObjectKind('clip.mp4', null)).toBe('video');
  expect(getObjectKind('document.pdf', null)).toBe('pdf');
  expect(getObjectKind('font.woff2', null)).toBe('binary');
  expect(canObjectBePreviewed('font.woff2', null)).toBe(false);
});

test('cell labels keep null and blob values out of the raw text', () => {
  expect(sqliteCellLabel({ kind: 'null', text: '' }, identity)).toBe('NULL');
  expect(sqliteCellLabel({ kind: 'blob', text: '12' }, identity)).toBe('BLOB (12 bytes)');
  expect(sqliteCellLabel({ kind: 'text', text: 'endmill' }, identity)).toBe('endmill');
  expect(sqliteCellLabel({ kind: 'integer', text: '9007199254740993' }, identity)).toBe('9007199254740993');
});
