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

The `OutboxJob` model is written in the same transaction as a notification and
its deliveries. It is marked processed only once BullMQ accepts its deterministic
job ID. `WebhookDelivery` separately records each signed webhook attempt.

For high-volume historical analytics, preserve these transactional indexes and
move aggregates to a reporting/warehouse pipeline rather than expanding live
table scans indefinitely.
