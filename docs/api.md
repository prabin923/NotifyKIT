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

## In-app inbox

Browsers cannot hold a tenant's secret API key, so the inbox is authenticated
with a separate short-lived end-user token instead.

`POST /v1/users/:externalUserId/token` requires `users:manage`. Mints a
short-lived token (default `USER_TOKEN_EXPIRES_IN=1h`) for that user, 404s
with `USER_NOT_FOUND` if the user does not exist for the tenant, and returns:

```json
{ "success": true, "data": { "token": "eyJ...", "expires_at": "2026-08-29T13:00:00.000Z" }, "request_id": "req_123" }
```

Call this from your backend after authenticating the browser session, then
hand the returned token to that browser. The rest of the inbox endpoints
authenticate with `Authorization: Bearer <token>` (not an API key) and are
scoped to that single end user; they are additionally rate-limited per user.

| Endpoint | Notes |
| --- | --- |
| `GET /v1/inbox` | Cursor-paginated, newest first. `?limit=` (1-100, default 50), `?cursor=`, `?status=unread\|read\|all` (default `all`), `?archived=true\|false` (default `false`). Returns `{ items, next_cursor }`; each item is `{ id, title, body, category, priority, data, created_at, seen_at, read_at, archived_at }`. |
| `GET /v1/inbox/count` | `{ unread, total }`, excluding archived items. |
| `POST /v1/inbox/:id/read` | Idempotent; also sets `seen_at` if it was not already set. 404s (`NOT_FOUND`) if the item is not this user's. |
| `POST /v1/inbox/:id/unread` | Idempotent; clears `read_at`. |
| `POST /v1/inbox/:id/seen` | Idempotent; sets `seen_at` on first call, otherwise a no-op. |
| `POST /v1/inbox/:id/archive` | Idempotent; excludes the item from the default (non-archived) list. |
| `POST /v1/inbox/read-all` | Marks every unread, non-archived item as read. Returns `{ updated }`. |

An item only appears in the inbox once its notification has an `IN_APP`
delivery — sending a notification with `channels: ["IN_APP"]` (via
`POST /v1/events` or `POST /v1/notifications`) is what creates one.

Dashboard users can review recent inbox items for their tenant with
`GET /v1/dashboard/inbox` (dashboard JWT, no role restriction beyond login).

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
`QUEUE_UNAVAILABLE`, `INVALID_STATE_TRANSITION`, `NOT_CANCELLABLE`,
`INVALID_TOKEN`, `NOT_FOUND`, and `SERVER_MISCONFIGURED`.
