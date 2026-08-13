import { NotificationStatus } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { assertNotificationTransition } from './notification-state';

describe('notification state machine', () => {
  it('allows a queued notification to begin processing', () => {
    expect(() => assertNotificationTransition(NotificationStatus.QUEUED, NotificationStatus.PROCESSING)).not.toThrow();
  });
  it('rejects a terminal notification transition', () => {
    expect(() => assertNotificationTransition(NotificationStatus.DELIVERED, NotificationStatus.QUEUED)).toThrow(ApiError);
  });
});
