# Database design

PostgreSQL is the source of truth. Every tenant-owned model has `tenant_id` and
all repository/service queries bind it from the authenticated API key or JWT;
clients never supply an authoritative tenant ID.

Key tenant isolation and throughput constraints:

| Concern | Constraint/index |
| --- | --- |
| End-user identity | `UNIQUE(tenant_id, external_id)` |
| Event idempotency | `UNIQUE(tenant_id, idempotency_key)` |
| Upstream event identity | `UNIQUE(tenant_id, external_event_id)` |
| Delivery de-duplication | `UNIQUE(notification_id, channel)` |
| Active template selection | index `(tenant_id, event_type, channel, status)` |
| Event lookup | index `(tenant_id, event_type, created_at)` |
| Operational queues | indexes on tenant/status/timestamps |
| Outbox recovery | index `(processed_at, available_at)` and unique dedupe key |
| In-app inbox reads | index `(tenant_id, user_id, read_at, created_at)` |

The `OutboxJob` model is written in the same transaction as a notification and
its deliveries. It is marked processed only once BullMQ accepts its deterministic
job ID. `WebhookDelivery` separately records each signed webhook attempt.

The in-app inbox reuses `Notification` rather than adding a parallel table: a
notification becomes an inbox item once it has a `Delivery` on the `IN_APP`
channel. Per-user state lives on the notification as `seen_at`, `read_at`, and
`archived_at` (all nullable — `NULL` means "not yet"), with an optional `data`
JSONB column the producing system can use for deep links. Inbox queries always
bind both `tenant_id` and `user_id`, because an end-user token proves only who
the caller is, never which tenant's rows it may read.

Inbox listing pages on `(created_at DESC, id DESC)`. The `id` tiebreaker is not
cosmetic: one event can fan out many notifications sharing a `created_at` to the
millisecond, and a cursor ordered on `created_at` alone would skip or repeat
rows across pages.

For high-volume historical analytics, preserve these transactional indexes and
move aggregates to a reporting/warehouse pipeline rather than expanding live
table scans indefinitely.
