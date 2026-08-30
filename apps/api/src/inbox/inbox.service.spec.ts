import { inboxActionPatch } from './inbox.service';

describe('inbox action state transitions', () => {
  const now = new Date('2026-08-29T12:00:00.000Z');

  it('marks read and backfills seen when the item was never seen', () => {
    expect(inboxActionPatch('read', { seenAt: null }, now)).toEqual({ readAt: now, seenAt: now });
  });

  it('marking read keeps the original seen time', () => {
    const seenAt = new Date('2026-08-29T11:00:00.000Z');
    expect(inboxActionPatch('read', { seenAt }, now)).toEqual({ readAt: now, seenAt });
  });

  it('marking unread only clears read_at', () => {
    expect(inboxActionPatch('unread', { seenAt: now }, now)).toEqual({ readAt: null });
  });

  it('marking seen is idempotent once already seen', () => {
    const seenAt = new Date('2026-08-29T09:00:00.000Z');
    expect(inboxActionPatch('seen', { seenAt }, now)).toEqual({ seenAt });
  });

  it('marking seen for the first time records now', () => {
    expect(inboxActionPatch('seen', { seenAt: null }, now)).toEqual({ seenAt: now });
  });

  it('archiving sets archived_at regardless of read/seen state', () => {
    expect(inboxActionPatch('archive', { seenAt: null }, now)).toEqual({ archivedAt: now });
  });
});
