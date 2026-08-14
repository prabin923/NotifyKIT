import { isIP } from 'node:net';

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19 || second === 51))
    || (first === 203 && second === 0)
    || first >= 224;
}

export function isAllowedWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const ipVersion = isIP(hostname);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && hostname !== 'localhost'
      && !hostname.endsWith('.localhost')
      && !hostname.endsWith('.local')
      && !hostname.endsWith('.internal')
      && ipVersion !== 6
      && !(ipVersion === 4 && isPrivateIpv4(hostname));
  } catch {
    return false;
  }
}
