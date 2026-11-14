/** Match regional Tencent COS service endpoints, never lookalike hostnames. */
export function cosRegion(endpoint: string): string | undefined {
  try {
    const value = endpoint.trim();
    const host = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname;
    return /^cos\.([a-z0-9-]+)\.myqcloud\.com$/i.exec(host)?.[1].toLowerCase();
  } catch {
    return undefined;
  }
}

/** A bounded, literal-only reader for the documented OBS YAML / env fields. */
export function parseObsConfig(text: string) {
  const invalid = 'Invalid OBS configuration. Paste the OBS endpoint, access key, secret key and optional bucket fields.';
  if (text.length > 32768 || new TextEncoder().encode(text).length > 32768) throw new Error(invalid);
  const fields = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(OBS_ENDPOINT_URL|OBS_ACCESS_KEY|OBS_SECRET_KEY|OBS_BUCKET)\s*[:=]\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('",')) || (value.startsWith("'") && value.endsWith("',"))) value = value.slice(0, -1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (fields.has(match[1]) || !value) throw new Error(invalid);
    fields.set(match[1], value);
  }
  if (!fields.get('OBS_ENDPOINT_URL') || !fields.get('OBS_ACCESS_KEY') || !fields.get('OBS_SECRET_KEY')) {
    throw new Error(invalid);
  }
  return {
    endpointUrl: fields.get('OBS_ENDPOINT_URL')!,
    accessKeyId: fields.get('OBS_ACCESS_KEY')!,
    secretAccessKey: fields.get('OBS_SECRET_KEY')!,
    defaultBucket: fields.get('OBS_BUCKET') || '',
  };
}
