import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { validatePublicUrl, isPrivateIP } from '../utils/ssrfProtection';

describe('SSRF Protection Service', () => {
  it('should identify private and loopback IPv4 addresses', () => {
    assert.strictEqual(isPrivateIP('127.0.0.1'), true, '127.0.0.1 must be private');
    assert.strictEqual(isPrivateIP('10.0.0.1'), true, '10.0.0.1 must be private');
    assert.strictEqual(isPrivateIP('192.168.1.1'), true, '192.168.1.1 must be private');
    assert.strictEqual(isPrivateIP('172.16.0.1'), true, '172.16.0.1 must be private');
    assert.strictEqual(isPrivateIP('169.254.169.254'), true, '169.254.169.254 (AWS metadata) must be private');
    assert.strictEqual(isPrivateIP('0.0.0.0'), true, '0.0.0.0 must be private');
  });

  it('should identify public IPv4 addresses', () => {
    assert.strictEqual(isPrivateIP('8.8.8.8'), false, '8.8.8.8 must be public');
    assert.strictEqual(isPrivateIP('93.184.216.34'), false, '93.184.216.34 (example.com) must be public');
    assert.strictEqual(isPrivateIP('1.1.1.1'), false, '1.1.1.1 must be public');
  });

  it('should block localhost and loopback domain URLs', async () => {
    await assert.rejects(
      async () => {
        await validatePublicUrl('http://localhost:5000/api/health');
      },
      /local and internal addresses is strictly forbidden/i,
      'localhost must be blocked'
    );

    await assert.rejects(
      async () => {
        await validatePublicUrl('http://127.0.0.1:8080');
      },
      /strictly forbidden|forbidden for security/i,
      '127.0.0.1 must be blocked'
    );
  });

  it('should block private subnet URLs', async () => {
    await assert.rejects(
      async () => {
        await validatePublicUrl('http://192.168.1.1/admin');
      },
      /private IP address "192.168.1.1" is forbidden/i,
      '192.168.1.1 must be blocked'
    );

    await assert.rejects(
      async () => {
        await validatePublicUrl('http://169.254.169.254/latest/meta-data');
      },
      /private IP address "169.254.169.254" is forbidden/i,
      '169.254.169.254 must be blocked'
    );
  });

  it('should reject non-HTTP/HTTPS protocols', async () => {
    await assert.rejects(
      async () => {
        await validatePublicUrl('ftp://example.com/files');
      },
      /Unsupported protocol/i,
      'ftp:// protocol must be rejected'
    );

    await assert.rejects(
      async () => {
        await validatePublicUrl('file:///etc/passwd');
      },
      /Unsupported protocol/i,
      'file:// protocol must be rejected'
    );
  });

  it('should validate and resolve legitimate public domains', async () => {
    const validated = await validatePublicUrl('https://example.com');
    assert.ok(validated.normalizedUrl.startsWith('https://example.com'));
    assert.strictEqual(validated.hostname, 'example.com');
    assert.ok(validated.resolvedIp, 'Must have a resolved IP');
    assert.strictEqual(isPrivateIP(validated.resolvedIp), false, 'Resolved IP must be public');
  });
});
