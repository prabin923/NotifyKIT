# Deployment

## Required production configuration

Set unique high-entropy `JWT_SECRET` and `API_KEY_PEPPER`, a base64-encoded
32-byte `WEBHOOK_ENCRYPTION_KEY`, PostgreSQL/Redis URLs, restrictive
`CORS_ORIGINS`, and provider credentials. Run API and workers as separate
replica groups against the same PostgreSQL and Redis deployments. Terminate TLS
at an ingress/load balancer; do not permit plaintext public ingress.

## Container deployment

```bash
cp .env.example .env
# replace all secret placeholders and select provider modes
docker compose up --build
```

The compose profile is suitable for local development. In production use managed
PostgreSQL/Redis, external SMTP/FCM, persistent log shipping, backups, and a
secret manager. Run `npx prisma migrate deploy --schema prisma/schema.prisma`
for reviewed migrations rather than `db push`.

## Scaling and monitoring

Scale API replicas horizontally; the API holds no in-process client state.
Scale channel workers independently. Alert on readiness failures, queue depth,
dead-letter jobs, provider failure rate, and webhook retry counts. Preserve
request IDs in application logs and propagate them to your telemetry system.
