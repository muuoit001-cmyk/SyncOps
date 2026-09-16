import axios from 'axios';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import nacl from 'tweetnacl';

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

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += alphabet[first >> 2];
    result += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    result += second === undefined ? '=' : alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    result += third === undefined ? '=' : alphabet[third & 63];
  }
  return result;
}

function base64ToBytes(value: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = value.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return new Uint8Array(bytes);
}

function ed25519PublicKeyToSpki(publicKey: Uint8Array): Uint8Array {
  const prefix = new Uint8Array([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);
  const result = new Uint8Array(prefix.length + publicKey.length);
  result.set(prefix);
  result.set(publicKey, prefix.length);
  return result;
}

export async function createDeviceKeyPair() {
  // Expo exposes secure randomness asynchronously; deriving from a seed avoids
  // tweetnacl's synchronous PRNG requirement in React Native.
  const seed = await Crypto.getRandomBytesAsync(32);
  const keyPair = nacl.sign.keyPair.fromSeed(seed);
  return {
    publicKeyB64: bytesToBase64(ed25519PublicKeyToSpki(keyPair.publicKey)),
    privateKeyB64: bytesToBase64(keyPair.secretKey),
  };
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
  privateKeyB64?: string,
) {
  const timestamp = String(Date.now());
  const payloadBody = body && Object.keys(body).length ? body : {};
  const bodyStr = JSON.stringify(payloadBody);
  const payload = `${deviceId}:${timestamp}:${bodyStr}`;
  const sig = privateKeyB64
    ? bytesToBase64(nacl.sign.detached(new TextEncoder().encode(payload), base64ToBytes(privateKeyB64)))
    : await hmacSha256Hex(deviceToken, payload);

  return api.request({
    method,
    url: path,
    data: method === 'GET' ? undefined : payloadBody,
    headers: {
      'X-Device-Id': deviceId,
      'X-Device-Sig': sig,
      ...(privateKeyB64 ? { 'X-Device-Sig-Alg': 'Ed25519' } : {}),
      'X-Timestamp': timestamp,
      'Content-Type': 'application/json',
    },
  });
}

export function getApiBaseUrl(): string {
  return BASE_URL;
}

export default api;
