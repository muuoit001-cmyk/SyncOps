import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';

// Configure base URL — update for production
const BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 8000, // 8s timeout — must respond well within 5s UX target
});

/**
 * Build an HMAC-signed request for device-authenticated endpoints.
 * Uses the device token stored in SecureStore.
 */
export async function signedRequest(
  method: 'GET' | 'POST',
  path: string,
  body: Record<string, unknown>,
  deviceId: string,
  deviceToken: string,
) {
  const timestamp = String(Date.now());
  const bodyStr = JSON.stringify(body);
  const payload = `${deviceId}:${timestamp}:${bodyStr}`;

  // HMAC-SHA256 via expo-crypto
  const sig = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    payload,
    { encoding: Crypto.CryptoEncoding.HEX }
  );

  return api.request({
    method,
    url: path,
    data: body,
    headers: {
      'X-Device-Id': deviceId,
      'X-Device-Sig': sig,
      'X-Timestamp': timestamp,
      'Content-Type': 'application/json',
    },
  });
}

export default api;
