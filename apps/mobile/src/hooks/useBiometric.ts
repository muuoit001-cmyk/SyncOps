import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback } from 'react';

export type BiometricType = 'fingerprint' | 'none';

interface BiometricCapabilities {
  isAvailable: boolean;
  type: BiometricType;
  isEnrolled: boolean;
}

export async function getBiometricCapabilities(): Promise<BiometricCapabilities> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return { isAvailable: false, type: 'none', isEnrolled: false };

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

  let type: BiometricType = 'none';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    type = 'fingerprint';
  }

  return { isAvailable: true, type, isEnrolled: enrolled };
}

/**
 * Prompt biometric auth.
 * Resolves to true on success, false on failure/cancel.
 *
 * Per spec: biometric prompt IS the confirmation — no "are you sure?" dialog.
 */
export async function promptBiometric(action: 'clock_in' | 'clock_out'): Promise<boolean> {
  const label = action === 'clock_in' ? 'Confirm Clock In' : 'Confirm Clock Out';
  try {
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (!supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: label,
      cancelLabel: 'Cancel',
      disableDeviceFallback: true,
      requireConfirmation: false,    // fastest path — no extra tap needed
    });
    return result.success;
  } catch {
    return false;
  }
}

export function useBiometric() {
  const authenticate = useCallback(
    (action: 'clock_in' | 'clock_out') => promptBiometric(action),
    []
  );
  return { authenticate };
}
