# Collab Handoff for Codex

[简体中文](README.zh-CN.md) | **English**

An open-source protocol and Codex integration that replaces ad-hoc backend/frontend copy-paste with three distinct components:

- a shared contract source in `contracts/`;
- an append-only, queryable Handoff Hub for decisions, acknowledgements, and unresolved questions;
- a Codex MCP bridge so each collaborator reads and writes the same Hub directly.

It is deliberately framework-neutral. The contract can be TypeScript, OpenAPI, protobuf, JSON Schema, generated code, or a link to an immutable API-platform revision.

## Why this exists

Chat transcripts are poor sources of truth. They lose context, drift from the actual DTO, and are difficult to review. This project makes the versioned file the authority and records collaboration state as immutable protocol events. No user needs to relay a DTO or reply between Codex sessions.

## What is included

- `plugins/collab-handoff`: a Codex plugin with `backend-handoff` and `frontend-query` skills;
- `.agents/plugins/marketplace.json`: a repository marketplace for installing the plugin;
- `packages/hub`: PostgreSQL-backed self-hosted Hub, GitHub contract connector, migrations, and tests;
- `PROTOCOL.md`: the v1 event and HTTP contract;
- `contracts/`: the shared, reviewable contract source (with a sample);
- `examples/`: copyable protocol request payloads.

## Self-hosted quick start

The fastest deployment is Docker Compose. Full instructions are in [docs/deploy.md](docs/deploy.md).

1. Generate two secrets, create `.env`, and start the Hub:

   ```powershell
   Copy-Item .env.example .env
   node .\scripts\create-token.mjs # run twice: database password and bootstrap token
   # Put the values in .env, then:
   docker compose up -d --build
   ```

   The server data is persisted in PostgreSQL. Run one centrally reachable Hub for a real team.

2. Put authoritative contracts under `contracts/`. Do not treat a Hub event as the contract.
3. Configure the repository marketplace once:

   ```powershell
   codex plugin marketplace add .
   codex plugin add collab-handoff@collab-handoff-community
   ```

4. Bootstrap the first administrator once, then create a project, register its GitHub repository, and invite the frontend/backend users. The bootstrap response returns the administrator's personal `ch_…` token exactly once.

5. On each collaborator’s machine, set their own personal token and the Hub URL in the environment that starts Codex:

   ```powershell
   $env:COLLAB_HANDOFF_HUB_URL = "https://handoff.example.internal"
   $env:COLLAB_HANDOFF_HUB_TOKEN = "ch_personal_token_returned_by_the_hub"
   ```

6. Start a new Codex thread. The backend skill calls `handoff_publish`; the frontend skill calls `handoff_list`, `handoff_get`, `contract_get`, and `handoff_reply` through MCP.

The Hub validates the GitHub file at the declared SHA and stores an immutable content snapshot. The plugin package contains a stdio MCP bridge; the Hub derives identity and authorization from the personal token rather than trusting an agent-supplied actor name.

## Workflow

```text
Backend changes contracts/… ──> handoff_publish ──> Handoff Hub
          │                                            │
          └──────── source of truth ───────────────────┤
                                                       │
Frontend reads the same contracts/… <── handoff_get ───┘
          │
          └─────────────────────── handoff_reply ──> Handoff Hub
                                                         │
Backend / product closes the loop <── handoff_resolve ──┘
```

The `contractRef` must contain a repository-relative path and a Git revision. The Hub never accepts absolute local paths.

## Contract layout

Keep stable, published material separate from examples and temporary output. For example:

```text
contracts/
  orders/
    order-api.openapi.yaml
  generated/
    order-api.ts
```

Do not put credentials, production data, or machine-specific paths in a contract or a handoff.

## Deployment boundary

The v1 Hub uses project memberships and per-user personal tokens. It should still run behind TLS and an identity-aware reverse proxy for production. GitHub credentials remain server-side, and must not be placed in an MCP request, handoff, or committed `.env` file.

The protocol boundary is stable: a production service can implement the HTTP routes in [PROTOCOL.md](PROTOCOL.md) while the Codex MCP bridge and skills continue to work unchanged.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes to the protocol should preserve backwards compatibility or document a migration in the release notes.

## License

MIT. See [LICENSE](LICENSE).
