# Deployment

## Required production configuration

Set unique high-entropy `JWT_SECRET` and `API_KEY_PEPPER`, a base64-encoded
32-byte `WEBHOOK_ENCRYPTION_KEY`, PostgreSQL/Redis URLs, restrictive
`CORS_ORIGINS`, and provider credentials. Run API and workers as separate
replica groups against the same PostgreSQL and Redis deployments. Terminate TLS
at an ingress/load balancer; do not permit plaintext public ingress.

## Long-running container deployment

```bash
cp .env.production.example .env.production
# set the managed PostgreSQL/Redis URLs, all secrets, and public HTTPS origins
docker compose --env-file .env.production -f docker-compose.production.yml config
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

To validate the Compose structure before creating the real secret file, run
`ENV_FILE=.env.production.example docker compose --env-file .env.production.example -f docker-compose.production.yml config`.

The production profile runs `migrate` once, then starts API, dashboard, and the
BullMQ delivery worker as independent services. The worker uses
`restart: unless-stopped`, receives SIGTERM for graceful shutdown, and has no
public port. API/dashboard ports bind only to loopback, so place a TLS reverse
proxy in front of them. Use `docker compose ... logs -f workers` and alert if
the worker is not running.

The API retries unprocessed transactional-outbox rows every
`OUTBOX_FLUSH_INTERVAL_MS` (five seconds by default), so a short Redis outage
does not strand notifications that were already committed to PostgreSQL.

Use a direct PostgreSQL connection for `migrate`; if application traffic uses
an acceleration/proxy URL, run the migration step with the database provider's
direct connection URL instead. The local `docker-compose.yml` is deliberately
development-only and uses `prisma db push`; do not use it in production.

Use managed PostgreSQL/Redis, external SMTP/FCM, persistent log shipping,
backups, and a secret manager. `DASHBOARD_URL` and `CORS_ORIGINS` must contain
the exact public dashboard origin. The browser always calls the dashboard's
same-origin `/api/proxy/*` route; the dashboard container reaches the private
API through `API_INTERNAL_URL=http://api:3000`.

## Vercel serverless deployment

`api/index.js` exposes the Express API as a Vercel serverless function, and
`vercel.json` rewrites only `/v1/*`, `/health/*`, and `/docs` to it — the
dashboard's own routes are left alone. Be honest with yourself about the
limits of this path before choosing it:

- It serves the HTTP API only. BullMQ workers (`apps/workers`) are a
  long-running process with persistent connections and must be deployed as a
  container or other always-on worker, never as a serverless function.
- It requires hosted, publicly reachable PostgreSQL and Redis; there is no
  local `docker-compose` network to fall back on.
- Each cold start calls `createExpressApi({ serverless: true })`, which skips
  installing the recurring outbox-flush timer (`QueueService.start`) — a
  serverless instance can be frozen or recycled between invocations with no
  process lifecycle to ever clear that interval, so it would otherwise leak
  one per cold start. It still connects to Redis, creates the queues, and
  runs one outbox flush per invocation, so already-committed jobs still get
  enqueued; the long-running API process (`apps/api/src/main.ts`) is
  unaffected and keeps the recurring flush.

## Prisma Compute API deployment

The API target packages its exact runtime dependencies and generated Prisma
Client through `npm run build:compute`. Verify it without replacing production:

```bash
bunx @prisma/cli@latest app deploy api --no-promote --json --no-interactive
```

Smoke-test the returned candidate URL, then promote only after its dashboard
origin is configured in both `DASHBOARD_URL` and `CORS_ORIGINS`. Prisma Compute
hosts the API only; run the worker as a separate long-running container.

## Scaling and monitoring

Scale API replicas horizontally; the API holds no in-process client state.
Scale channel workers independently. Alert on readiness failures, queue depth,
dead-letter jobs, provider failure rate, and webhook retry counts. Preserve
request IDs in application logs and propagate them to your telemetry system.
