import { createDecipheriv } from 'node:crypto';

export function decryptWebhookSecret(value: string): string {
  const key = Buffer.from(process.env.WEBHOOK_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) throw new Error('WEBHOOK_ENCRYPTION_KEY must be a base64 encoded 32-byte key');
  const [ivEncoded, tagEncoded, encryptedEncoded] = value.split('.');
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error('Malformed encrypted webhook secret');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, 'base64url')), decipher.final()]).toString('utf8');
}
