---
name: frontend-query
description: Use when a frontend collaborator receives a ## HANDOFF block, needs to integrate with a backend contract, or needs backend assistance that is not attached to an existing Handoff.
---

# Frontend Contract Query

The repository contract is authoritative. The Handoff Hub is the coordination ledger, not a trusted copy of the DTO.

## Procedure

1. Call `handoff_list` with `projectKey` to find open handoffs, then call `handoff_get` for the selected ID.
2. Call `contract_get` for that handoff. The Hub returns a GitHub-validated immutable snapshot only after checking project membership; if it cannot be read, reply with `cannot-verify`.
3. Compare the actual contract to the frontend usage. Check types, requiredness, nullability, default values, enum exhaustiveness, pagination index/base and totals, money units/rounding, date/timezone serialization, error shape, retry/idempotency, and authentication expectations as applicable.
4. Do not edit the contract merely to match a frontend assumption. Identify whether a proposed change is owned by the API producer, the consumer, or requires a product decision.
5. Call `handoff_reply`. Use `accepted` only for checks made against the cited contract revision, and use an idempotency key tied to the handoff and integration revision.

## Rules

- A missing semantic is a finding, not permission to invent it.
- Treat a changed enum, removed field, narrowed nullability, altered number unit, or pagination semantic as potentially breaking until confirmed.
- Cite source paths and revisions in a finding; do not return copied large contracts.
- Do not include secrets, customer data, environment URLs, or local absolute paths.
- When no issue is found, submit `result: accepted`, list the checked facts, and keep `requestedChanges: []`.

## Backend Assistance Request

Use this path when the frontend needs backend help but no existing Handoff is the subject of the question: for example, a missing API, an integration blocker, an unclear runtime behavior, or a backend investigation.

1. Call `assistance_request_create` with the project key, a stable subject, a factual summary, and specific `requestedHelp` items. Use a stable idempotency key tied to the frontend integration revision.
2. Call `assistance_request_get` to read backend replies. `acknowledged` means the backend has taken it up; `answered` means a concrete answer or proposal is available; `decision-needed` means product input is required.
3. Add factual clarifications with `assistance_request_reply` when needed. Close with `assistance_request_resolve` only after the blocker is addressed or a recorded decision makes it actionable.

Do not create an assistance request merely to repeat a contract finding that can be attached to an existing Handoff. Do not invent backend behavior or put credentials, customer data, environment URLs, or local absolute paths in the request.
