import { NotificationStatus } from '@prisma/client';
import { ApiError } from '../common/api-error';

const transitions: Record<NotificationStatus, readonly NotificationStatus[]> = {
  CREATED: ['QUEUED', 'CANCELLED', 'EXPIRED'],
  QUEUED: ['PROCESSING', 'CANCELLED', 'EXPIRED', 'FAILED'],
  PROCESSING: ['SENT', 'DELIVERED', 'RETRYING', 'FAILED', 'CANCELLED'],
  SENT: ['DELIVERED', 'FAILED', 'RETRYING'],
  DELIVERED: ['OPENED'],
  OPENED: [],
  FAILED: [],
  RETRYING: ['QUEUED', 'PROCESSING', 'FAILED', 'CANCELLED'],
  CANCELLED: [],
  EXPIRED: [],
};

export function assertNotificationTransition(current: NotificationStatus, next: NotificationStatus): void {
  if (!transitions[current].includes(next)) throw new ApiError('INVALID_STATE_TRANSITION', `Cannot transition notification from ${current} to ${next}.`, 409);
}

export { transitions as notificationTransitions };
