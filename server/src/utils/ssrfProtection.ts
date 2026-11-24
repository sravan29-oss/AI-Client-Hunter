import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net, { type LookupFunction } from 'node:net';
import axios from 'axios';
import { BadRequestError } from './errors';

// Conservatively exclude special-purpose networks from public website fetching.
const ipv4Blocked = new net.BlockList();
for (const [network, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) ipv4Blocked.addSubnet(network, bits);
ipv4Blocked.addAddress('168.63.129.16'); // Azure platform address

const ipv6Global = new net.BlockList();
ipv6Global.addSubnet('2000::', 3, 'ipv6');
const ipv6Blocked = new net.BlockList();
for (const [network, bits] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) ipv6Blocked.addSubnet(network, bits, 'ipv6');

export function isPrivateIPv4(ip: string): boolean {
  return !net.isIPv4(ip) || ipv4Blocked.check(ip);
}

export function isPrivateIPv6(ip: string): boolean {
  return !net.isIPv6(ip) || ip.includes('%') || !ipv6Global.check(ip, 'ipv6') || ipv6Blocked.check(ip, 'ipv6');
}

export function isPrivateIP(ip: string): boolean {
  return net.isIPv4(ip) ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}

interface ValidatedUrl {
  valid: true;
  normalizedUrl: string;
  hostname: string;
  resolvedIp: string;
  family: number;
}

async function lookupPublicAddresses(hostname: string, signal: AbortSignal): Promise<dns.LookupAddress[]> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    void dns.promises.lookup(hostname, { all: true }).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function validatePublicUrl(rawUrl: string, signal = AbortSignal.timeout(5000)): Promise<ValidatedUrl> {
  const input = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(input.includes('://') ? input : `https://${input}`);
  } catch {
    throw new BadRequestError('Enter a valid public website URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestError('Unsupported protocol. Only HTTP and HTTPS are allowed.');
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestError('Website URLs must omit credentials.');
  }
  parsed.hash = '';
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!hostname || /(^|\.)(localhost|local|internal)$/.test(hostname)) {
    throw new BadRequestError('Access to local and internal addresses is strictly forbidden.');
  }

  const family = net.isIP(hostname);
  if (family && isPrivateIP(hostname)) {
    throw new BadRequestError(`Access to private IP address "${hostname}" is forbidden for security.`);
  }
  // Website audits only need the standard HTTP and HTTPS service ports.
  if (parsed.port) {
    throw new BadRequestError('Only standard HTTP and HTTPS website ports are allowed.');
  }
  let addresses: dns.LookupAddress[];
  try {
    addresses = family ? [{ address: hostname, family }] : await lookupPublicAddresses(hostname, signal);
  } catch {
    throw new BadRequestError(signal.aborted ? 'Website DNS lookup timed out.' : 'The website domain could not be resolved.');
  }
  if (!addresses.length || addresses.some(({ address, family }) => net.isIP(address) !== family || isPrivateIP(address))) {
    throw new BadRequestError('The website resolves to a private, reserved, or invalid network address.');
  }
  const [address] = addresses;
  return { valid: true, normalizedUrl: parsed.toString(), hostname, resolvedIp: address.address, family: address.family };
}

export class WebsiteHttpError extends BadRequestError {
  constructor(readonly upstreamStatus: number) {
    super(`Website returned HTTP ${upstreamStatus}.`);
  }
}

export interface SafeFetchResult {
  url: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  html: string;
  loadTimeMs: number;
  contentLength: number;
  isHttps: boolean;
  hadHttpsRedirect: boolean;
}

function pinnedLookup(target: ValidatedUrl): LookupFunction {
  return (hostname, options, callback) => {
    if (hostname.toLowerCase().replace(/\.$/, '') !== target.hostname) {
      callback(new Error('Unexpected website hostname.'), '', 0);
      return;
    }
    if (options.all) callback(null, [{ address: target.resolvedIp, family: target.family }]);
    else callback(null, target.resolvedIp, target.family);
  };
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maxBytes = 3 * 1024 * 1024;

export async function safeFetchHtml(rawUrl: string, maxRedirects = 4): Promise<SafeFetchResult> {
  const started = Date.now();
  const signal = AbortSignal.timeout(10000);
  const first = await validatePublicUrl(rawUrl, signal);
  let current = first;
  let hadHttpsRedirect = false;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const lookup = pinnedLookup(current);
    // Keep the URL hostname for Host, certificate validation, and SNI.
    const httpAgent = new http.Agent({ lookup });
    const httpsAgent = new https.Agent({ lookup, rejectUnauthorized: true });
    let response;
    try {
      response = await axios.get<string>(current.normalizedUrl, {
        httpAgent, httpsAgent, proxy: false, signal, timeout: 10000,
        maxRedirects: 0, validateStatus: () => true, responseType: 'text',
        maxContentLength: maxBytes, maxBodyLength: maxBytes,
        headers: {
          'User-Agent': 'AIClientHunter/1.0 (Website Analyzer)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8',
        },
      });
    } catch (error) {
      if (signal.aborted || (axios.isAxiosError(error) && ['ETIMEDOUT', 'ECONNABORTED'].includes(error.code || ''))) {
        throw new BadRequestError('Website request timed out.');
      }
      throw new BadRequestError('Website connection failed or exceeded the response limit.');
    } finally {
      httpAgent.destroy();
      httpsAgent.destroy();
    }

    if (redirectStatuses.has(response.status) && response.headers.location) {
      if (hop === maxRedirects) throw new BadRequestError('Website exceeded the redirect limit.');
      let destination: URL;
      try {
        destination = new URL(response.headers.location, current.normalizedUrl);
      } catch {
        throw new BadRequestError('Website returned an invalid redirect.');
      }
      if (current.normalizedUrl.startsWith('http:') && destination.protocol === 'https:') hadHttpsRedirect = true;
      current = await validatePublicUrl(destination.href, signal);
      continue;
    }

    if (response.status < 200 || response.status >= 300) throw new WebsiteHttpError(response.status);
    const html = response.data;
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    if (typeof html !== 'string' || (contentType && !/^(?:text\/html|application\/xhtml\+xml|text\/plain)(?:\s*;|$)/.test(contentType))) {
      throw new BadRequestError('Website response was not an HTML or text page.');
    }
    const contentLength = Buffer.byteLength(html, 'utf8');
    if (contentLength > maxBytes) throw new BadRequestError('Website exceeded the response limit.');
    return {
      url: first.normalizedUrl, finalUrl: current.normalizedUrl, statusCode: response.status,
      headers: response.headers as Record<string, string>, html, loadTimeMs: Date.now() - started,
      contentLength, isHttps: current.normalizedUrl.startsWith('https:'), hadHttpsRedirect,
    };
  }

  throw new BadRequestError('Website exceeded the redirect limit.');
}
