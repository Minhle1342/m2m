import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { M2MError } from '@m2m/shared';

const LEGACY_DEVELOPMENT_SECRET = 'm2m-local-development-key-change-me';

function keyFromSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function encryptionKey(): Buffer {
  const secret = process.env.MASTER_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production' || process.env.AUTH_MODE === 'production') throw new M2MError('CONFIG_ERROR', 'MASTER_ENCRYPTION_KEY must contain at least 32 characters');
    return keyFromSecret(LEGACY_DEVELOPMENT_SECRET);
  }
  return keyFromSecret(secret);
}

export function encryptCredential(data: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((value) => value.toString('base64url')).join('.');
}

function decryptWithKey(payload: string, key: Buffer): Record<string, string> {
  const [ivRaw, tagRaw, dataRaw] = payload.split('.');
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error('Malformed encrypted credential');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8')) as Record<string, string>;
}

export function decryptCredentialWithMetadata(payload: string): {
  data: Record<string, string>;
  usedLegacyDevelopmentKey: boolean;
} {
  try {
    return { data: decryptWithKey(payload, encryptionKey()), usedLegacyDevelopmentKey: false };
  } catch {
    const canTryLegacy = process.env.AUTH_MODE !== 'production'
      && process.env.NODE_ENV !== 'production'
      && Boolean(process.env.MASTER_ENCRYPTION_KEY);
    if (canTryLegacy) {
      try {
        return {
          data: decryptWithKey(payload, keyFromSecret(LEGACY_DEVELOPMENT_SECRET)),
          usedLegacyDevelopmentKey: true
        };
      } catch {
        // Fall through to the stable credential error below.
      }
    }
    throw new M2MError('CREDENTIAL_ERROR', 'Credential data cannot be decrypted');
  }
}

export function decryptCredential(payload: string): Record<string, string> {
  return decryptCredentialWithMetadata(payload).data;
}
