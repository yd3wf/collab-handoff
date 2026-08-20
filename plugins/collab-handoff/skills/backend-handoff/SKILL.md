---
name: backend-handoff
description: Use when a backend API, DTO, event, error code, pagination rule, or generated client contract must be handed to a frontend collaborator. Create or update a shared repository contract, then output a concise HANDOFF that points to its exact path and Git revision.
---

# Backend Handoff

The versioned repository contract is authoritative. The Handoff Hub stores coordination events, never a substitute for the contract.

## Procedure

1. Put the authoritative artifact under `contracts/`, or identify the existing repository-relative contract path. Do not paste a large DTO into the chat when a file can be cited.
2. Inspect the actual diff and use the revision containing that diff. Do not publish `UNCOMMITTED` as a team handoff: commit the contract first so another machine can reproduce it.
3. Identify whether the change is additive, compatible, or breaking. Do not infer pagination bases, money units, nullability, enum semantics, authentication, or error-code meanings.
4. Call MCP tool `handoff_publish` with the registered `projectKey`, GitHub repository owner/name, committed SHA, repository-relative path, factual summary, compatibility, checks, and unresolved decisions. Identity and project role come from the Hub token; never supply or trust an `actorId` in the tool input. Use a stable `idempotencyKey`, such as `<subject>:<revision>`.
5. Report only the returned handoff ID and any unresolved decision in the chat. Do not ask a human to copy the event to another Codex session.

## Rules

- Include all behavior that affects an integration: field name/type, requiredness, defaulting, units, date format/timezone, pagination, enums, errors, idempotency, and auth scope when applicable.
- Cite generated output and its source schema if both matter.
- Mark uncertainty explicitly. Never claim a deployed endpoint or production configuration was verified unless it was actually tested.
- Do not include secrets, personal data, access tokens, full stack traces, or local absolute paths.
- If the Hub is unavailable, say that publishing is blocked; do not silently fall back to a copied DTO. A temporary chat summary must state that it is not a protocol event.
- When a reply exists, first call `handoff_get`, open the cited contract revision, and compare it with the finding. Publish a new handoff only after the authority has changed; call `handoff_resolve` when the original handoff is closed.
- For frontend-originated questions that are not about an existing Handoff, call `assistance_request_list` and `assistance_request_get`, then respond with `assistance_request_reply`. Use `answered` only with a factual answer or a cited change; use `decision-needed` when product input is genuinely required. Do not create a synthetic contract Handoff solely to carry the request.
