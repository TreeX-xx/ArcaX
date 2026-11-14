import { expect, test } from 'vitest';
import { cosRegion, parseObsConfig } from '@/lib/s3Endpoint';

test('COS endpoint recognition requires the exact service host', () => {
  expect(cosRegion(' https://cos.ap-guangzhou.myqcloud.com ')).toBe('ap-guangzhou');
  expect(cosRegion('cos.ap-shanghai.myqcloud.com')).toBe('ap-shanghai');
  expect(cosRegion('https://cos.ap-guangzhou.myqcloud.com.evil.test')).toBeUndefined();
  expect(cosRegion('https://cos.ap-guangzhou.evil.myqcloud.com')).toBeUndefined();
  expect(cosRegion('http://localhost:9000')).toBeUndefined();
});

test('OBS YAML and env import preserve literal credentials and bucket names', () => {
  for (const separator of [': ', '=']) {
    expect(parseObsConfig([
      `OBS_ENDPOINT_URL${separator}"https://cos.ap-guangzhou.myqcloud.com"`,
      `OBS_ACCESS_KEY${separator}"example-access"`,
      `OBS_SECRET_KEY${separator}"example-secret/+=:$()"`,
      `OBS_BUCKET${separator}"example-1250000000"`,
    ].join('\n'))).toEqual({ endpointUrl: 'https://cos.ap-guangzhou.myqcloud.com', accessKeyId: 'example-access', secretAccessKey: 'example-secret/+=:$()', defaultBucket: 'example-1250000000' });
  }
});

test('invalid imports do not echo secrets in errors', () => {
  expect(() => parseObsConfig('OBS_SECRET_KEY: sensitive-value')).toThrow(/^Invalid OBS configuration\./);
  expect(() => parseObsConfig('x'.repeat(32769))).toThrow(/^Invalid OBS configuration\./);
  expect(() => parseObsConfig('字'.repeat(12000))).toThrow(/^Invalid OBS configuration\./);
  expect(() => parseObsConfig('OBS_ACCESS_KEY: one\nOBS_ACCESS_KEY: two')).toThrow(/^Invalid OBS configuration\./);
});

test('unquoted env credentials retain punctuation literally', () => {
  expect(parseObsConfig('OBS_ENDPOINT_URL=https://cos.ap-guangzhou.myqcloud.com\nOBS_ACCESS_KEY=test\nOBS_SECRET_KEY=literal,').secretAccessKey).toBe('literal,');
});

import cases from '../fixtures/s3-providers.json';
import { endpointInfo, parseConnectionConfig, providerEndpoint } from '@/lib/s3Endpoint';
test.each(cases)('provider recognition matches the native fixtures: $endpoint', entry => {
  expect(endpointInfo(entry.endpoint)).toEqual(entry.provider ? { provider: entry.provider, region: entry.region } : undefined);
});
test('provider defaults and imports include temporary credentials without evaluating literals', () => {
  expect(providerEndpoint('oss', 'cn-hangzhou')).toBe('https://s3.oss-cn-hangzhou.aliyuncs.com');
  expect(providerEndpoint('obs', 'cn-north-4')).toBe('https://obs.cn-north-4.myhuaweicloud.com');
  expect(providerEndpoint('oss', '../invalid')).toBe('');
  expect(parseConnectionConfig('OSS_ENDPOINT=https://s3.oss-cn-hangzhou.aliyuncs.com\nOSS_ACCESS_KEY_ID=test\nOSS_ACCESS_KEY_SECRET=literal$()\nOSS_SECURITY_TOKEN=token')).toMatchObject({ accessKeyId: 'test', secretAccessKey: 'literal$()', sessionToken: 'token' });
  expect(() => parseConnectionConfig('OBS_ENDPOINT_URL=https://one\nOSS_ENDPOINT=https://two\nOSS_ACCESS_KEY_ID=test\nOSS_ACCESS_KEY_SECRET=secret')).toThrow(/^Invalid connection configuration/);
});


test('standard S3 endpoint and bucket aliases import alongside AWS temporary credentials', () => {
  expect(parseConnectionConfig('S3_ENDPOINT=https://storage.example.com\nAWS_ACCESS_KEY_ID=test\nAWS_SECRET_ACCESS_KEY=secret\nAWS_SESSION_TOKEN=token\nS3_BUCKET=bucket')).toMatchObject({ endpointUrl: 'https://storage.example.com', sessionToken: 'token', defaultBucket: 'bucket' });
});
