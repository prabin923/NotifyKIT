# Universal Notification Platform

Multi-tenant Notification-as-a-Service infrastructure: external systems send a
universal event, the platform authenticates and isolates the tenant, applies
idempotency and workflows, resolves templates and preferences, and delivers
asynchronously through replaceable channels.

## Features

- Express REST API with API reference at `/docs`, structured error envelopes, request IDs, health checks, API keys, dashboard JWTs, and RBAC.
- PostgreSQL/Prisma tenant isolation, indexes, compound idempotency, audit logs, encrypted webhook secrets, and transactional outbox.
- BullMQ/Redis email, push, webhook, retry, and dead-letter architecture.
- Real SMTP and FCM integrations when configured; safe console delivery adapters for local use.
- Signed HMAC-SHA256 outbound webhooks with timeout, retry, and attempt tracking.
- In-app inbox channel with per-user read/seen/archive state, end-user scoped tokens, and a
  cursor-paginated `/v1/inbox` API browsers can call directly.
- Drop-in `<notifykit-inbox>` web component (Shadow DOM, zero dependencies, one `<script>` tag).
- Next.js/Tailwind operations dashboard plus publishable JavaScript/TypeScript and Python SDKs.

## Architecture

```mermaid
flowchart LR
  S[Any client] -->|REST / SDK / webhook capable| API[Universal Event API]
  API --> DB[(PostgreSQL)]
  API --> Q[(Redis / BullMQ)]
  Q --> W[Independent workers]
  W --> C[SMTP / FCM / client webhook]
  W --> IN[(In-app inbox)]
  IN --> BW[notifykit-inbox widget / browser SDK]
  UI[Next.js dashboard] --> API
```

See [architecture documentation](docs/architecture.md), [API reference](docs/api.md),
[database design](docs/database.md), [workflow lifecycle](docs/workflows.md), and
[deployment guide](docs/deployment.md).

## Requirements

Node.js 22+, Docker Compose, and a PostgreSQL/Redis-capable environment.

## Local installation

```bash
cp .env.example .env
# Replace JWT_SECRET, API_KEY_PEPPER, and WEBHOOK_ENCRYPTION_KEY.
docker compose up -d postgres redis mailpit
npm install
npm run prisma:generate
npx prisma db push --schema prisma/schema.prisma
npm run prisma:seed
npm run dev
```

The API and worker start commands load the root `.env` file automatically.

API: `http://localhost:3000`; API reference: `http://localhost:3000/docs`; dashboard:
`http://localhost:3001`; local Mailpit: `http://localhost:8025`.

When running the dashboard on another local port, set both
`DASHBOARD_PORT` and `DASHBOARD_ORIGIN` (for example, `3101` and
`http://localhost:3101`) before starting Compose so browser CORS remains valid.

For all containers, run `docker compose up --build`. Docker expects an `.env`
and synchronizes the local database schema. Run `prisma migrate deploy` in a
production deployment pipeline. The dashboard now keeps browser traffic on its
own origin through `/api/proxy/*`; `API_INTERNAL_URL` is used only by the
dashboard server to reach the API, so browsers never need direct access to a
private API port.

For a long-running production worker, use the separate production Compose
profile documented in [docs/deployment.md](docs/deployment.md). It restarts the
worker process after a failure and keeps it independent from HTTP API replicas.

## Demo event

The seed command prints a one-time `nk_test_...` key. Use it immediately:

```bash
curl -X POST http://localhost:3000/v1/events \
  -H "Authorization: Bearer nk_test_xxx" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-order-123" \
  -d '{"event":"order.created","user":{"id":"demo-user","email":"demo@example.test","name":"Demo User"},"data":{"order_id":"ORD-123","amount":2500}}'
```

The API returns `202` immediately. The worker emits a console email by default;
choose `EMAIL_PROVIDER=smtp` with Mailpit/SMTP configuration for real SMTP.

## Embedding in a web app

The inbox is designed to be embedded. Browsers must never hold a tenant's secret key, so
integration is two steps:

1. Your **backend** mints a short-lived, per-user token with its secret API key:

```bash
curl -X POST http://localhost:3000/v1/users/user_123/token \
  -H "Authorization: Bearer nk_test_xxx"
# -> { "success": true, "data": { "token": "eyJ...", "expires_at": "..." } }
```

2. Your **frontend** drops in the widget with that token — no framework, no build step:

```html
<script src="https://your-cdn.example/inbox-widget.iife.js"></script>
<notifykit-inbox token="eyJ..." base-url="https://api.example.com"></notifykit-inbox>
```

Pointing `base-url` at another origin requires that origin in the API's `CORS_ORIGINS`.
For a custom UI, use `createInboxClient({ token })` from the JS SDK against `/v1/inbox`
instead. See [packages/inbox-widget](packages/inbox-widget/README.md) for the full attribute
and event reference.

## SDKs

```ts
import { NotificationClient } from '@notification-platform/sdk';
const client = new NotificationClient({ apiKey: process.env.NOTIFICATION_API_KEY! });
await client.events.create({ event: 'order.created', user: { id: 'user_123' }, data: { order_id: 'ORD-123' } });
```

```python
from notification_platform import NotificationClient
client = NotificationClient(api_key="nk_test_xxx")
client.events.create("order.created", {"id": "user_123"}, {"order_id": "ORD-123"})
```

The inbox client is a separate export that takes an end-user token, never the secret key:

```ts
import { createInboxClient } from '@notification-platform/sdk';
const inbox = createInboxClient({ token, baseUrl: 'https://api.example.com' });
const { items, next_cursor } = await inbox.list({ status: 'unread' });
```

Any HTTP-capable system can use the REST event API; SDKs are convenience layers,
not a required integration path.

## Providers and security

SMTP requires `SMTP_*`; set `EMAIL_PROVIDER=smtp`. FCM requires the three
`FCM_*` values and `PUSH_PROVIDER=fcm`. Webhook secrets are AES-256-GCM encrypted
at rest and requests are signed as `X-Notification-Signature: sha256=...`.
Webhook endpoints must be public HTTPS hostnames; loopback, private IP, local,
internal, credential-bearing, and redirect targets are rejected.

Never commit `.env`, raw API keys, credentials, or secret-manager exports.
Tenant identity is always resolved from server-side credentials, not the body.

## Testing and quality checks

```bash
npm run build
npm test
TEST_DATABASE_URL=postgresql://notification:notification@localhost:5432/notification_platform?schema=public \
TEST_REDIS_URL=redis://localhost:6379/15 npm run test:e2e
git diff --check
```

When running against the provided Compose Postgres service, use
`notification:notification` credentials in `TEST_DATABASE_URL`.

Tests cover state transitions, templates, API key behavior, and the event flow;
the E2E suite requires the local Postgres and Redis dependencies.

## Roadmap

The intentionally deferred extensions are SMS/WhatsApp/Slack/Discord, iOS APNs,
full conditional/wait/fallback execution and visual workflow editing, provider
failover, analytics warehouse, SSO/SCIM, billing, Kafka, Kubernetes, and
multi-region delivery.
