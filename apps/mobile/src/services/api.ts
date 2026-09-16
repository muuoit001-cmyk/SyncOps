import axios from 'axios';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';

function getBaseUrl(): string {
  const configured = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL;
  if (configured) {
    let clean = configured.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `https://${clean}`;
    }
    if (!clean.endsWith('/api')) {
      clean = `${clean}/api`;
    }
    return clean;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp) return `http://${hostIp}:3001/api`;
  }

  return 'https://syncops-production-f5ac.up.railway.app/api';
}

const BASE_URL = getBaseUrl();

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
});

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const key = await subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await subtle.sign('HMAC', key, encoder.encode(message));
    return bytesToHex(new Uint8Array(signature));
  }

  // Fallback: HMAC-SHA256 using expo-crypto SHA-256
  const keyBytes = encoder.encode(secret);
  const block = new Uint8Array(64);
  block.set(keyBytes.length > 64 ? hexToBytes(await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    secret,
    { encoding: Crypto.CryptoEncoding.HEX },
  )) : keyBytes);

  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = block[i] ^ 0x36;
    opad[i] = block[i] ^ 0x5c;
  }

  const inner = await sha256Bytes(concatBytes(ipad, encoder.encode(message)));
  const outer = await sha256Bytes(concatBytes(opad, inner));
  return bytesToHex(outer);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

async function sha256Bytes(data: Uint8Array): Promise<Uint8Array> {
  let binary = '';
  data.forEach((b) => { binary += String.fromCharCode(b); });
  const hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    binary,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return hexToBytes(hex);
}

/**
 * Build an HMAC-signed request for device-authenticated endpoints.
 */
export async function signedRequest(
  method: 'GET' | 'POST',
  path: string,
  body: Record<string, unknown>,
  deviceId: string,
  deviceToken: string,
) {
  const timestamp = String(Date.now());
  const payloadBody = body && Object.keys(body).length ? body : {};
  const bodyStr = JSON.stringify(payloadBody);
  const payload = `${deviceId}:${timestamp}:${bodyStr}`;
  const sig = await hmacSha256Hex(deviceToken, payload);

  return api.request({
    method,
    url: path,
    data: method === 'GET' ? undefined : payloadBody,
    headers: {
      'X-Device-Id': deviceId,
      'X-Device-Sig': sig,
      'X-Timestamp': timestamp,
      'Content-Type': 'application/json',
    },
  });
}

export function getApiBaseUrl(): string {
  return BASE_URL;
}

export default api;
