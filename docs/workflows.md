# Workflow and notification lifecycle

Workflows are tenant-scoped JSON documents. The MVP validates the supported
node vocabulary (`EVENT`, `SEND_NOTIFICATION`, `WAIT`, `CONDITION`, `CHANNEL`,
`FALLBACK`, `END`) and executes the first `SEND_NOTIFICATION` routing decision.
`WAIT`, conditional branching, and fallback chains are deliberately retained as
validated definition nodes for the next workflow-runner increment; they are not
silently simulated as executed behavior.

```json
{
  "nodes": [
    { "type": "EVENT" },
    { "type": "SEND_NOTIFICATION", "category": "transactional", "channels": ["EMAIL"], "priority": "HIGH" },
    { "type": "END" }
  ]
}
```

## State machine

```mermaid
stateDiagram-v2
  [*] --> CREATED
  CREATED --> QUEUED
  CREATED --> CANCELLED
  QUEUED --> PROCESSING
  QUEUED --> CANCELLED
  QUEUED --> EXPIRED
  PROCESSING --> SENT
  PROCESSING --> RETRYING
  PROCESSING --> FAILED
  RETRYING --> QUEUED
  RETRYING --> PROCESSING
  RETRYING --> FAILED
  SENT --> DELIVERED
  DELIVERED --> OPENED
```

The API enforces cancellation transitions and workers enforce terminal states.
Provider acknowledgement is `SENT`; a later provider receipt can transition to
`DELIVERED` without inventing delivery confirmation.
