# Collab Handoff Protocol v1

The HTTP API is the authority. MCP tools are a thin adapter over the same endpoints. Identity comes from the bearer token; clients must not send an `actorId`, role, or unverified repository path as an authority claim.

## Invariants

1. Every Handoff belongs to a project and an authenticated project member.
2. A contract is identified by registered GitHub repository, commit SHA, and repository-relative path.
3. Before creating a Handoff, the Hub resolves that GitHub file and stores its SHA-256 content snapshot.
4. Handoff events are append-only. `handoffs.status` is a query projection.
5. An idempotency key is unique for its authenticated actor.

## Setup API

| Method | Route | Authorization |
| --- | --- | --- |
| `POST` | `/v1/bootstrap` | `X-Bootstrap-Token`, one time |
| `POST` | `/v1/tokens` | authenticated user |
| `POST` | `/v1/projects` | authenticated user |
| `POST` | `/v1/projects/{key}/members` | project owner |
| `POST` | `/v1/projects/{key}/repositories` | project owner |

## Collaboration API

| Method | Route | Role |
| --- | --- | --- |
| `POST` | `/v1/handoffs` | owner or backend |
| `GET` | `/v1/handoffs?projectKey=…` | project member |
| `GET` | `/v1/handoffs/{id}` | project member |
| `GET` | `/v1/handoffs/{id}/contract` | project member |
| `POST` | `/v1/handoffs/{id}/replies` | owner, backend, or frontend |
| `POST` | `/v1/handoffs/{id}/resolve` | owner or backend |
| `POST` | `/v1/assistance-requests` | owner or frontend |
| `GET` | `/v1/assistance-requests?projectKey=…` | project member |
| `GET` | `/v1/assistance-requests/{id}` | project member |
| `POST` | `/v1/assistance-requests/{id}/replies` | owner, backend, or frontend |
| `POST` | `/v1/assistance-requests/{id}/resolve` | owner, backend, or frontend |

## Create payload

```json
{
  "projectKey": "orders",
  "subject": "orders.list",
  "repository": { "owner": "acme", "name": "orders-api" },
  "revision": "8f3c2ab",
  "path": "contracts/orders.openapi.yaml",
  "summary": "Added cursor pagination.",
  "compatibility": "additive",
  "frontendChecks": ["Handle nextCursor as nullable."],
  "decisionNeeded": [],
  "idempotencyKey": "orders.list:8f3c2ab"
}
```

The Hub uses statuses `open`, `acknowledged`, `changes_requested`, `decision_needed`, `cannot_verify`, and `resolved`. A client receives a contract snapshot only after project membership has been verified.

## Frontend-originated assistance request

Use an assistance request when the frontend needs backend help but no existing versioned contract Handoff is the subject. It is independent from contract snapshots, but is still project-scoped, authenticated, append-only, and idempotent per actor.

```json
{
  "projectKey": "orders",
  "subject": "orders.payment",
  "summary": "The payment callback is received, but the UI has no queryable terminal state.",
  "requestedHelp": ["Confirm the query endpoint and terminal-state enum."],
  "idempotencyKey": "orders.payment:frontend-main:2026-08-20"
}
```

Assistance-request statuses are `open`, `acknowledged`, `answered`, `decision_needed`, and `resolved`. Replies use `acknowledged`, `answered`, or `decision-needed`; any participant with owner, backend, or frontend role may add factual clarification or close the request. A backend answer that changes a contract must still be published through the normal Handoff flow.
