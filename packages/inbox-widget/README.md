# @notification-platform/inbox-widget

A drop-in, zero-dependency browser inbox widget for NotifyKIT: a `<notifykit-inbox>`
[custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) with an
isolated Shadow DOM, a bell trigger with an unread-count badge, and a popover panel listing
in-app notifications. Add it with a single `<script>` tag — no framework, no build step, no
runtime dependencies.

## Auth model (read this first)

Browsers can never hold your tenant's secret API key. Instead:

1. Your **backend** calls the platform with your secret key to mint a short-lived, per-user
   token.
2. Your backend hands that token to the browser (e.g. embedded in the page, or fetched from
   your own authenticated endpoint).
3. The widget calls the inbox API using **only** that token, as `Authorization: Bearer <token>`.
   It never sees your secret key.

Mint a token from your backend:

```bash
curl -X POST https://api.your-notifykit-host.example/v1/users/user_123/token \
  -H "Authorization: Bearer $NOTIFYKIT_SECRET_KEY" \
  -H "Content-Type: application/json"
```

```json
{
  "success": true,
  "data": { "token": "eyJhbGciOi...", "expires_at": "2026-08-29T15:00:00.000Z" },
  "request_id": "..."
}
```

Pass `data.token` to the browser and render the widget once your page has it. Tokens expire
(default 1 hour, see `USER_TOKEN_EXPIRES_IN`); re-mint and update the `token` attribute/property
before it lapses, or on a 401 from the widget's own requests (surfaced as its error state).

## Cross-origin setup

The widget is a browser client, so if `base-url` points at a different origin than the page
embedding it, the API must allow that origin. Add your app's exact origin to the API's
`CORS_ORIGINS` (comma-separated, no wildcards):

```
CORS_ORIGINS=https://dashboard.example.com,https://app.your-product.example
```

Without this the browser blocks every inbox request and the widget shows its error state.
Leaving `base-url` unset keeps requests same-origin and needs no CORS change — use that when
you proxy the API under your own domain.

## Quickstart (script tag)

```html
<script src="https://your-cdn.example/inbox-widget.iife.js"></script>
<notifykit-inbox
  token="eyJhbGciOi..."
  base-url="https://api.your-notifykit-host.example"
></notifykit-inbox>
```

That's it — the script registers `<notifykit-inbox>` as a side effect. See
`example/index.html` in this package for a runnable, plain-HTML page (open it directly in a
browser after pointing `token`/`base-url` at a real deployment).

## Quickstart (bundler / ESM)

```ts
import { defineInboxWidget } from '@notification-platform/inbox-widget';

defineInboxWidget(); // registers <notifykit-inbox>; call once, anywhere before first render
```

```html
<notifykit-inbox token="eyJhbGciOi..."></notifykit-inbox>
```

Frameworks that render on the server (Next.js, etc.) must import and call `defineInboxWidget()`
from client-only code (e.g. inside `useEffect`, or a `'use client'` component) — custom elements
require a browser.

## Attributes / properties

Every attribute has a matching JS property (setting either one keeps the other in sync).

| Attribute        | Property       | Type                          | Default            | Notes |
|------------------|----------------|-------------------------------|---------------------|-------|
| `token`          | `.token`       | `string`                      | `''` (required)     | End-user token from step 3 above. While empty, the widget stays idle and logs one console warning. |
| `base-url`       | `.baseUrl`     | `string`                      | `''` (same-origin)  | Set to point at another origin, e.g. `https://api.example.com`. |
| `poll-interval`  | `.pollInterval`| `number` (ms)                 | `30000`             | How often to poll `GET /v1/inbox/count`. `0` disables polling entirely. Polling pauses while the tab is hidden and refreshes immediately on regaining visibility. |
| `theme`          | `.theme`       | `'light' \| 'dark' \| 'auto'` | `'auto'`             | `'auto'` follows `prefers-color-scheme`. |
| `page-size`      | `.pageSize`    | `number`                      | `20`                 | Items per page for the list and "Load more". |

## Events

Emitted on the `<notifykit-inbox>` element itself (`bubbles: true, composed: true`, so they
cross the shadow boundary and can be caught anywhere above it in the host page):

- **`notifykit:open`** — fired when the panel opens. `detail: { unread: number, total: number }`.
- **`notifykit:select`** — fired when a notification is clicked/activated (before it's marked
  read). `detail` is the full notification item. **Cancelable**: call `event.preventDefault()`
  to stop the widget's default behavior of opening `data.url`/`data.link` in a new tab — do this
  if you want to handle navigation yourself (e.g. client-side routing).
- **`notifykit:count`** — fired whenever the unread/total count refreshes (poll tick, visibility
  regain, or after a read/archive action). `detail: { unread: number, total: number }`.

```js
document.querySelector('notifykit-inbox').addEventListener('notifykit:select', (event) => {
  console.log('selected', event.detail);
  // event.preventDefault(); // uncomment to take over navigation yourself
});
```

## Deep links

If a notification's `data` payload includes a `url` (or `link`) string field, clicking the
notification opens it in a new tab (`window.open(url, '_blank', 'noopener,noreferrer')`) unless
`notifykit:select` was cancelled. The platform doesn't enforce a schema for `data` — this is a
convention, not a contract — so omit it if you don't need deep links.

## Behavior notes

- Built as a native Custom Element with Shadow DOM (`mode: 'open'`): the host page's CSS can
  never leak in, and the widget's styles can never leak out.
- Unread-count polling is paused while `document.hidden` is `true` and resumes (with an
  immediate refresh) on `visibilitychange`.
- In-flight requests are serialized: a superseded list request (e.g. switching filters quickly)
  aborts the previous one; concurrent count refreshes share a single in-flight promise.
- All timers and listeners are cleaned up in `disconnectedCallback` — safe to remove/re-add the
  element (e.g. inside a SPA route change) without leaking.
- Accessible by default: the trigger has `aria-label`/`aria-expanded`, the panel is a non-modal
  `role="dialog"`, the unread count has an `aria-live` announcement region, focus moves into the
  panel on open and returns to the trigger on close, Escape closes the panel, and all interactive
  elements have visible focus rings.

## Build

```bash
npm run build -w @notification-platform/inbox-widget
```

Emits to `dist/`:
- `inbox-widget.js` (+ `.d.ts`) — ESM, for bundler consumers.
- `inbox-widget.iife.js` — self-registering IIFE, for a plain `<script src>` tag.
