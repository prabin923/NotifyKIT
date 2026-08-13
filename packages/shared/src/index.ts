import { createHash, timingSafeEqual } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_match, path: string) => {
    const value = path.split('.').reduce<unknown>((current, key) => {
      if (current !== null && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, context);
    return value === undefined || value === null ? '' : String(value);
  });
}

export function redactSensitive(value: string): string {
  return value.length <= 8 ? '********' : `${value.slice(0, 4)}…${value.slice(-4)}`;
}
