# notification-platform-sdk

Dependency-free Python SDK for [NotifyKIT](../../README.md). Uses only the standard library
(`urllib`) -- no `requests`, no third-party HTTP client.

## Install

```bash
pip install notification-platform-sdk
```

## Two clients, two credentials

| Client | Credential | Where it runs |
| --- | --- | --- |
| `NotificationClient` | Tenant **secret API key** | Your backend only. Never anywhere an end user can read it. |
| `InboxClient` | Short-lived **end-user token** | Safe to hand to the end user's own surface. |

## Quickstart: sending events from your backend

```python
from notification_platform import NotificationClient

client = NotificationClient(
    api_key="...",
    base_url="https://api.yourdomain.com",  # defaults to http://localhost:3000
)

client.events.create(
    event="order.shipped",
    user={"id": "user_123", "email": "jane@example.com"},
    data={"order_id": "ord_456", "tracking_url": "https://..."},
)
```

`events.create` requires the `events:write` permission on the API key.

### Idempotency, retries, and timeouts

```python
client.events.create(event="order.shipped", user={"id": "user_123"}, idempotency_key="my-key")
```

- Every request has a 15s timeout by default (`timeout_seconds` constructor argument).
- GET/PUT/PATCH requests, and POST requests carrying an `idempotency_key`, are retried up to
  2 times (`max_retries` constructor argument) with exponential backoff and jitter on 429s,
  5xxs, and network errors. A `Retry-After` response header is honored when present.
- A plain POST with no idempotency key is never retried automatically, since retrying it
  could create a duplicate.
- Failures raise `NotificationApiError` with `.code`, `.status`, and `.details`.

```python
from notification_platform import NotificationApiError

try:
    client.notifications.create(user_id="user_123", notification={"title": "Hi", "message": "..."}, channels=["EMAIL"])
except NotificationApiError as error:
    print(error.code, error.status, error.details)
```

## Quickstart: the end-user inbox (two-step token flow)

The in-app inbox (`IN_APP` channel) belongs to a single end user, so it authenticates with a
short-lived token instead of your secret API key.

**Step 1 -- your backend mints a token** for that user, using the secret-key client:

```python
result = client.users.mint_token(external_user_id)
token, expires_at = result["token"], result["expires_at"]
# hand `token` to wherever the end user is, however you like
```

This requires the `users:manage` permission and never exposes your API key.

**Step 2 -- consume the inbox with only that token**:

```python
from notification_platform import InboxClient

inbox = InboxClient(token=token)

counts = inbox.count()  # {"unread": ..., "total": ...}
page = inbox.list(status="unread", limit=20)

inbox.read(page["items"][0]["id"])
inbox.read_all()
inbox.archive(page["items"][1]["id"])
```

Tokens expire (`USER_TOKEN_EXPIRES_IN` on the server, default 1h); re-mint from your backend
and construct a new `InboxClient` when a call raises `NotificationApiError` with code
`INVALID_TOKEN`.

## Method reference

```python
client.events.create(event, user, data=None, idempotency_key=None, external_event_id=None)  # events:write

client.notifications.create(user_id, notification, channels, scheduled_at=None, expires_at=None)  # notifications:write
client.notifications.list(status=None, limit=None, cursor=None)                                    # notifications:read
client.notifications.get(notification_id)                                                          # notifications:read
client.notifications.cancel(notification_id)                                                       # notifications:write

client.templates.list()                                              # templates:read
client.templates.create(name, event_type, channel, body, ...)        # templates:write
client.templates.update(template_id, **fields)                       # templates:write

client.users.list()                                                  # users:manage
client.users.register_device(external_user_id, device_token, platform, app_version=None)  # devices:manage
client.users.mint_token(external_user_id)                            # users:manage
client.users.preferences.get(external_user_id)                       # users:manage
client.users.preferences.put(external_user_id, category, channel, enabled)  # users:manage

client.webhooks.list()                                                # webhooks:manage
client.webhooks.create(url, events, secret=None)                      # webhooks:manage
client.webhooks.update(webhook_id, status=None, events=None)          # webhooks:manage

client.workflows.list()                                               # workflows:manage
client.workflows.create(name, event_type, definition, status=None)    # workflows:manage
client.workflows.update(workflow_id, **fields)                        # workflows:manage

client.analytics.overview(date_from=None, date_to=None)                # analytics:read

# separate, end-user-token client:
inbox.list(status=None, limit=None, cursor=None, archived=None)
inbox.count()
inbox.read_all()
inbox.read(item_id) / inbox.unread(item_id) / inbox.seen(item_id) / inbox.archive(item_id)
```

All request bodies use the same `snake_case` field names as the HTTP API -- this SDK is a
thin wrapper, not a remapping layer. Some read endpoints (e.g. `notifications.get`) return the
underlying database row as-is, which is why those return values are typed as plain `dict`
rather than promising a shape the API doesn't actually guarantee.
