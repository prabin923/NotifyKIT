# API reference

All public application endpoints are versioned under `/v1`. Responses use a
success envelope and include `request_id`; error payloads never expose stack
traces. API clients authenticate with `Authorization: Bearer nk_test_...` or a
live key. Dashboard endpoints authenticate with a dashboard JWT.

## Events

### `POST /v1/events`

Permission: `events:write`. Accepts an external event and returns `202` after
the event, notification plan, deliveries, and transactional outbox records are
committed. Send `Idempotency-Key` (or `idempotency_key` in the body) to make
replays safe.

```json
{
  "event": "order.created",
  "user": { "id": "user_123", "email": "user@example.com" },
  "data": { "order_id": "ORD-123", "amount": 2500 }
}
```

```json
{ "success": true, "event_id": "evt_123", "status": "accepted", "notification_ids": ["ntf_123"], "request_id": "req_123" }
```

The same key returns the original event with `idempotent_replay: true`.

Dashboard users can edit a recorded event with `PATCH /v1/dashboard/events/:id`.
The request may include `event`, `external_event_id` (or `null` to clear it),
and `data`. Edits update the stored event metadata only: they do not re-run a
workflow, requeue notifications, or modify the original user snapshot.

## Notifications

`POST /v1/notifications` requires `notifications:write` and returns `202`.
It accepts `user_id`, `notification` (`title`, `message`, optional priority and
category), uppercase `channels`, optional `scheduled_at`, and `expires_at`.

`GET /v1/notifications` and `GET /v1/notifications/:id` require
`notifications:read`. `POST /v1/notifications/:id/cancel` requires
`notifications:write`; sent, delivered, failed, expired, and already cancelled
notifications cannot be cancelled.

## Configuration resources

| Endpoint | Permission | Purpose |
| --- | --- | --- |
| `GET/POST/PATCH /v1/templates` | `templates:read` / `templates:write` | Versioned channel templates |
| `GET/POST/PATCH /v1/workflows` | `workflows:manage` | JSON workflow definitions |
| `GET/PUT /v1/users/:externalUserId/preferences` | `users:manage` | Category/channel preferences |
| `GET/POST/PATCH /v1/webhooks` | `webhooks:manage` | Public HTTPS webhook subscriptions (no private/local targets or redirects) |
| `GET /v1/analytics` | `analytics:read` | Current-period operational metrics |

## Dashboard and key management

`POST /v1/auth/login` accepts dashboard email/password and returns an access
token. `GET /v1/auth/me` validates it. Dashboard-only read models are under
`/v1/dashboard/*`. Dashboard users with OWNER, ADMIN, or DEVELOPER may use
`GET/POST/DELETE /v1/api-keys`; raw keys are returned once, only at creation.

## Health and operational errors

`GET /health/live` checks process liveness. `/health` and `/health/ready`
check PostgreSQL and Redis. Typical error codes are `INVALID_REQUEST`,
`UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `DUPLICATE_RESOURCE`,
`QUEUE_UNAVAILABLE`, `INVALID_STATE_TRANSITION`, `NOT_CANCELLABLE`, and
`SERVER_MISCONFIGURED`.
