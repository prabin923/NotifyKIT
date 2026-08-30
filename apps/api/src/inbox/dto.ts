// The end-user inbox routes are all query-string GETs or bodyless action POSTs, so there is no
// JSON body for class-validator to check here; these are the shapes app.ts parses query params
// into before handing them to InboxService, kept alongside the service like the other DTOs.
export type InboxStatusFilter = 'unread' | 'read' | 'all';

export interface InboxListQuery {
  limit?: number;
  cursor?: string;
  status?: InboxStatusFilter;
  archived?: boolean;
}
