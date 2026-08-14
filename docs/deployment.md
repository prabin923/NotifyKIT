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
