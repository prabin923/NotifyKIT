import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ApiError } from './api-error';

export class SecretCipherService {
  private key(): Buffer {
    const encoded = process.env.WEBHOOK_ENCRYPTION_KEY;
    const key = encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
    if (key.length !== 32) throw new ApiError('SERVER_MISCONFIGURED', 'Webhook encryption is not configured.', 503);
    return key;
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decrypt(value: string): string {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
    if (!iv || !tag || !encrypted) throw new Error('Malformed encrypted secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
