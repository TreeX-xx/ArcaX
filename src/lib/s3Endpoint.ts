export type StorageProvider = 'auto' | 'cos' | 'oss' | 'obs';

// Keep these cases aligned with s3/client.rs; neither accepts bucket-specific or lookalike hosts.
export function endpointInfo(endpoint: string): { provider: StorageProvider; region: string } | undefined {
  try {
    const value = endpoint.trim();
    const host = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname;
    const rules: [StorageProvider, RegExp][] = [
      ['cos', /^cos\.([a-z0-9-]+)\.myqcloud\.com$/i],
      ['oss', /^(?:s3\.)?oss-([a-z0-9-]+)\.aliyuncs\.com$/i],
      ['obs', /^obs\.([a-z0-9-]+)\.myhuaweicloud\.com$/i],
    ];
    for (const [provider, rule] of rules) {
      const match = rule.exec(host);
      if (match) return { provider, region: provider === 'oss' ? match[1].replace(/-internal$/, '') : match[1] };
    }
  } catch { /* Incomplete form input. */ }
  return undefined;
}

export function cosRegion(endpoint: string) {
  const info = endpointInfo(endpoint);
  return info?.provider === 'cos' ? info.region : undefined;
}

export function providerEndpoint(provider: StorageProvider, region: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(region)) return '';
  switch (provider) {
    case 'cos': return `https://cos.${region}.myqcloud.com`;
    case 'oss': return `https://s3.oss-${region}.aliyuncs.com`;
    case 'obs': return `https://obs.${region}.myhuaweicloud.com`;
    default: return '';
  }
}

const aliases: Record<string, string> = {
  OBS_ENDPOINT_URL: 'endpointUrl', OSS_ENDPOINT: 'endpointUrl', COS_ENDPOINT: 'endpointUrl', S3_ENDPOINT: 'endpointUrl', S3_ENDPOINT_URL: 'endpointUrl',
  OBS_ACCESS_KEY: 'accessKeyId', OSS_ACCESS_KEY_ID: 'accessKeyId', COS_SECRET_ID: 'accessKeyId', AWS_ACCESS_KEY_ID: 'accessKeyId',
  OBS_SECRET_KEY: 'secretAccessKey', OSS_ACCESS_KEY_SECRET: 'secretAccessKey', COS_SECRET_KEY: 'secretAccessKey', AWS_SECRET_ACCESS_KEY: 'secretAccessKey',
  OBS_BUCKET: 'defaultBucket', OSS_BUCKET: 'defaultBucket', COS_BUCKET: 'defaultBucket', S3_BUCKET: 'defaultBucket',
  OBS_SECURITY_TOKEN: 'sessionToken', OSS_SECURITY_TOKEN: 'sessionToken', COS_SESSION_TOKEN: 'sessionToken', AWS_SESSION_TOKEN: 'sessionToken',
};

/** A bounded literal importer. Conflicting aliases are rejected, never evaluated. */
export function parseConnectionConfig(text: string) {
  const invalid = 'Invalid connection configuration. Include an endpoint, access key and secret key.';
  if (text.length > 32768 || new TextEncoder().encode(text).length > 32768) throw new Error(invalid);
  const fields = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*[:=]\s*(.*?)\s*$/.exec(line);
    if (!match || !Object.hasOwn(aliases, match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('",')) || (value.startsWith("'") && value.endsWith("',"))) value = value.slice(0, -1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    const key = aliases[match[1]];
    if (fields.has(key) || !value) throw new Error(invalid);
    fields.set(key, value);
  }
  if (!fields.get('endpointUrl') || !fields.get('accessKeyId') || !fields.get('secretAccessKey')) throw new Error(invalid);
  return {
    endpointUrl: fields.get('endpointUrl')!, accessKeyId: fields.get('accessKeyId')!, secretAccessKey: fields.get('secretAccessKey')!,
    defaultBucket: fields.get('defaultBucket') || '',
    ...(fields.has('sessionToken') ? { sessionToken: fields.get('sessionToken')! } : {}),
  };
}

/** Legacy API for callers importing the 0.0.6 OBS field set. */
export function parseObsConfig(text: string) {
  try { return parseConnectionConfig(text); }
  catch { throw new Error('Invalid OBS configuration. Paste the OBS endpoint, access key, secret key and optional bucket fields.'); }
}
