# @notification-platform/sdk

JavaScript/TypeScript SDK for [NotifyKIT](../../README.md). Works in Node.js 18+ and in
browsers. Ships ESM, CommonJS, and `.d.ts` types.

## Install

```bash
npm install @notification-platform/sdk
```

## Two clients, two credentials

This package exports **two independent clients** because they hold two different kinds of
credential, and mixing them up would mean leaking your tenant's secret key:

| Client | Credential | Where it runs |
| --- | --- | --- |
| `NotificationClient` | Tenant **secret API key** | Your backend only. Never in a browser. |
| `InboxClient` / `createInboxClient` | Short-lived **end-user token** | Safe in a browser. |

## Quickstart: sending events from your backend

```ts
import { NotificationClient } from '@notification-platform/sdk';

const notifyKit = new NotificationClient({
  apiKey: process.env.NOTIFYKIT_API_KEY!,
  // baseUrl defaults to http://localhost:3000 — point at your deployed API in production.
  baseUrl: 'https://api.yourdomain.com',
});

await notifyKit.events.create({
  event: 'order.shipped',
  user: { id: 'user_123', email: 'jane@example.com' },
  data: { order_id: 'ord_456', tracking_url: 'https://...' },
});
```

`events.create` requires the `events:write` permission on the API key. See the full method
list below for every other resource (notifications, templates, users, preferences, webhooks,
workflows, analytics) and the permission each one needs.

### Idempotency, retries, and timeouts

```ts
await notifyKit.events.create(input, 'my-idempotency-key');
```

- Every request has a 15s timeout by default (`timeoutMs` option).
- GET/PUT/PATCH requests, and POST requests carrying an `Idempotency-Key`, are retried up to
  2 times (`maxRetries` option) with exponential backoff and jitter on 429s, 5xxs, and network
  errors. A `Retry-After` response header is honored when present.
- A plain POST with no idempotency key (e.g. a one-off `events.create` call without one) is
  never retried automatically, since retrying it could create a duplicate.
- Failures raise `NotificationApiError` with `.code`, `.status`, and `.details`.
- Every method takes an optional trailing `{ signal }` for caller-driven cancellation, e.g.
  `notifyKit.notifications.list({}, { signal: controller.signal })`. That signal is combined
  with, never replaces, the SDK's own timeout.

```ts
import { NotificationApiError } from '@notification-platform/sdk';

try {
  await notifyKit.notifications.create(input);
} catch (error) {
  if (error instanceof NotificationApiError) {
    console.error(error.code, error.status, error.details);
  }
}
```

## Quickstart: the browser inbox (two-step token flow)

The in-app inbox (`IN_APP` channel) is read by the end user's own browser, so it authenticates
with a short-lived token instead of your secret API key.

**Step 1 — your backend mints a token** for the signed-in user, using the secret-key client:

```ts
// server-side, e.g. an endpoint your own frontend calls after the user logs in
const { token, expires_at } = await notifyKit.users.mintToken(externalUserId);
// hand `token` to the browser however you like (JSON response, embedded in the page, etc.)
```

This requires the `users:manage` permission and never exposes your API key to the browser.

**Step 2 — the browser uses that token**, and only that token:

```ts
import { createInboxClient } from '@notification-platform/sdk';

const inbox = createInboxClient({ token /* from step 1 */ });

const { unread, total } = await inbox.count();
const { items, next_cursor } = await inbox.list({ status: 'unread', limit: 20 });

await inbox.read(items[0].id);
await inbox.readAll();
await inbox.archive(items[1].id);
```

Tokens expire (`USER_TOKEN_EXPIRES_IN` on the server, default 1h); re-mint from your backend
and construct a new `InboxClient` when a call fails with `NotificationApiError` code
`INVALID_TOKEN`.

## Method reference

```ts
notifyKit.events.create(input, idempotencyKey?)          // events:write

notifyKit.notifications.create(input)                    // notifications:write
notifyKit.notifications.list({ status?, limit?, cursor? })// notifications:read
notifyKit.notifications.get(id)                           // notifications:read
notifyKit.notifications.cancel(id)                        // notifications:write

notifyKit.templates.list()                                // templates:read
notifyKit.templates.create(input)                         // templates:write
notifyKit.templates.update(id, input)                     // templates:write

notifyKit.users.list()                                    // users:manage
notifyKit.users.registerDevice(externalUserId, input)     // devices:manage
notifyKit.users.mintToken(externalUserId)                 // users:manage
notifyKit.users.preferences.get(externalUserId)           // users:manage
notifyKit.users.preferences.put(externalUserId, input)    // users:manage

notifyKit.webhooks.list()                                 // webhooks:manage
notifyKit.webhooks.create(input)                          // webhooks:manage
notifyKit.webhooks.update(id, input)                      // webhooks:manage

notifyKit.workflows.list()                                // workflows:manage
notifyKit.workflows.create(input)                         // workflows:manage
notifyKit.workflows.update(id, input)                     // workflows:manage

notifyKit.analytics.overview({ from?, to? })              // analytics:read

// separate, browser-safe client:
inbox.list({ status?, limit?, cursor?, archived? })
inbox.count()
inbox.readAll()
inbox.read(id) / inbox.unread(id) / inbox.seen(id) / inbox.archive(id)
```

All request bodies use the same `snake_case` field names as the HTTP API — this SDK is a thin
typed wrapper, not a remapping layer. Some read endpoints (e.g. `notifications.get`) return the
underlying database row as-is, which is why those return types are typed loosely rather than
promising a shape the API doesn't actually guarantee.
