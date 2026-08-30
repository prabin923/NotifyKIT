export { NotifykitInboxElement, defineInboxWidget } from './element';
export type { InboxCountResult, InboxItem, InboxListResult, InboxStatusFilter } from './api';

import type { InboxCountResult, InboxItem } from './api';
import type { NotifykitInboxElement } from './element';

// Convenience augmentation for consumers using TypeScript + a bundler; the IIFE build
// (src/register.ts) never touches this file's type-only exports.
declare global {
  interface HTMLElementTagNameMap {
    'notifykit-inbox': NotifykitInboxElement;
  }
  interface HTMLElementEventMap {
    'notifykit:open': CustomEvent<InboxCountResult>;
    'notifykit:select': CustomEvent<InboxItem>;
    'notifykit:count': CustomEvent<InboxCountResult>;
  }
}
