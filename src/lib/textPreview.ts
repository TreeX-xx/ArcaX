import { getEditorLanguage } from './objectCapabilities';

/** Format JSON whitespace without reserializing numbers, strings, or duplicate keys. */
export function formatTextPreview(text: string, name: string, contentType?: string | null): string {
  if (getEditorLanguage(name, contentType) !== 'json') return text;

  try {
    JSON.parse(text);
  } catch {
    return text;
  }

  const tokens = text.match(/"(?:\\.|[^"\\])*"|[^\s{}\[\],:]+|[{}\[\],:]/g) ?? [];
  const output: string[] = [];
  let depth = 0;
  const newline = () => output.push('\n', '  '.repeat(depth));

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === '{' || token === '[') {
      output.push(token);
      depth++;
      if (tokens[index + 1] !== '}' && tokens[index + 1] !== ']') newline();
    } else if (token === '}' || token === ']') {
      depth--;
      if (tokens[index - 1] !== '{' && tokens[index - 1] !== '[') newline();
      output.push(token);
    } else if (token === ',') {
      output.push(token);
      newline();
    } else {
      output.push(token === ':' ? ': ' : token);
    }
  }
  return output.join('');
}
