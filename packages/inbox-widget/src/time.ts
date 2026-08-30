const DIVISIONS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [60, 'seconds'],
  [60, 'minutes'],
  [24, 'hours'],
  [7, 'days'],
  [4.34524, 'weeks'],
  [12, 'months'],
  [Number.POSITIVE_INFINITY, 'years'],
];

let formatter: Intl.RelativeTimeFormat | undefined;

export function relativeTime(iso: string, now: number = Date.now()): string {
  formatter ??= new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  let duration = (new Date(iso).getTime() - now) / 1000;
  for (const [amount, unit] of DIVISIONS) {
    if (Math.abs(duration) < amount) return formatter.format(Math.round(duration), unit);
    duration /= amount;
  }
  return formatter.format(Math.round(duration), 'years');
}
