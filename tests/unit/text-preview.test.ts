import { expect, test } from 'vitest';
import { formatTextPreview } from '@/lib/textPreview';

test('JSON previews indent nested objects and arrays while keeping empty containers compact', () => {
  expect(formatTextPreview('{"items":[{"ok":true},null,[],{}]}', 'data.JSON')).toBe(
    '{\n  "items": [\n    {\n      "ok": true\n    },\n    null,\n    [],\n    {}\n  ]\n}',
  );
});

test('formatting preserves large numbers, duplicate keys, escapes, and string whitespace', () => {
  const text = String.raw`{"id":9007199254740993,"id":1e+30,"text":"a  b\n\"{},:[]","escaped":"\u0041"}`;
  expect(formatTextPreview(text, 'data.json')).toBe(String.raw`{
  "id": 9007199254740993,
  "id": 1e+30,
  "text": "a  b\n\"{},:[]",
  "escaped": "\u0041"
}`);
});

test.each(['', '{broken', '{"a":1,}', '{"a":1}\n{"a":2}'])('invalid JSON stays readable as originally loaded: %s', text => {
  expect(formatTextPreview(text, 'data.json')).toBe(text);
});

test('metadata identifies JSON without a JSON filename and other text is unchanged', () => {
  expect(formatTextPreview('{"ok":true}', 'data', 'APPLICATION/PROBLEM+JSON; charset=utf-8')).toBe('{\n  "ok": true\n}');
  expect(formatTextPreview('{"ok":true}', 'data.txt', 'text/plain')).toBe('{"ok":true}');
});
