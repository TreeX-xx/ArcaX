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
