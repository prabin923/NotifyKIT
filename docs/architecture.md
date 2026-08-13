# Architecture

The platform is a modular monolith: the HTTP API remains stateless, PostgreSQL
is the tenant-isolated source of truth, and BullMQ/Redis supplies asynchronous
work execution. Module boundaries allow workers or providers to be extracted
later without changing the public event contract.

```mermaid
flowchart LR
  C[Client system] -->|API key + REST| A[NestJS API]
  A -->|tenant-scoped transaction| P[(PostgreSQL)]
  A -->|jobs| R[(Redis / BullMQ)]
  R --> W[Workers]
  W --> E[Email provider]
  W --> U[Push provider]
  W --> H[Client webhooks]
  D[Next.js dashboard] -->|JWT| A
```

## Trust boundaries

API keys resolve a tenant server-side; request bodies never select the tenant.
All tenant-owned queries accept the resolved tenant ID. Raw credentials are
never persisted: API keys use a peppered SHA-256 hash and dashboard passwords
use bcrypt. Webhook secrets are stored for signing only and never returned.

## Event and delivery flow

```mermaid
sequenceDiagram
  participant C as Client
  participant A as API
  participant DB as PostgreSQL
  participant Q as BullMQ
  participant W as Worker
  participant P as Provider
  C->>A: POST /v1/events + API key
  A->>DB: idempotent event transaction
  A->>Q: enqueue notification work
  A-->>C: 202 accepted
  Q->>W: process delivery
  W->>P: send
  P-->>W: provider result
  W->>DB: delivery state + audit
```

## Reliability model

The accepted event is committed before its job is enqueued. On enqueue failure,
the API returns a service error rather than pretending the event was accepted.
Workers use deterministic job IDs, classified retryable failures, exponential
backoff, and a dead-letter queue. State transitions are explicitly validated.

## Scaling

API replicas are stateless. BullMQ workers can be scaled independently by
channel. PostgreSQL indexes tenant/event/status query paths; reporting is kept
as bounded aggregate queries for the MVP and can move to a reporting store.

## Queue topology and failures

```mermaid
flowchart TD
  O[Transactional Outbox] --> N[Notification planning]
  O --> E[Email queue]
  O --> P[Push queue]
  E --> W1[Email worker]
  P --> W2[Push worker]
  W1 --> WH[Webhook queue]
  W2 --> WH
  WH --> W3[Webhook worker]
  W1 --> DLQ[Dead-letter queue]
  W2 --> DLQ
  W3 --> DLQ
```

BullMQ retries transient provider errors after 30 seconds, 1 minute, 2 minutes,
and 4 minutes. Invalid recipients and permanent 4xx webhook failures are not
retried. Invalid FCM tokens are removed; failures create an explicit delivery
record and terminal jobs are copied to the dead-letter queue.
