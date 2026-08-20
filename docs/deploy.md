# Self-hosting Collab Handoff

Collab Handoff v1 is a self-hosted service for teams that use Codex independently but need one authoritative integration workflow. It requires Docker Compose, a reachable private DNS/IP, and Node.js 20+ on each Codex client for the stdio MCP bridge.

## 1. Start the service

```powershell
git clone <your-fork-url> collab-handoff
Set-Location collab-handoff
Copy-Item .env.example .env
node .\scripts\create-token.mjs # generate POSTGRES_PASSWORD
node .\scripts\create-token.mjs # generate HUB_BOOTSTRAP_TOKEN
```

Put each generated value in `.env`, then start the database and Hub:

```powershell
docker compose up -d --build
docker compose ps
Invoke-RestMethod http://127.0.0.1:8787/health
```

`GITHUB_TOKEN` is optional for public repositories and required for private repositories or reliable GitHub API limits. It remains only on the Hub server. PostgreSQL data is stored in Docker volume `collab_handoff_postgres`; back it up with normal PostgreSQL backup procedures before upgrades.

## 2. Bootstrap the administrator

This request works once. The returned `token` is shown only in this response; keep it in a password manager.

```powershell
$bootstrap = '<HUB_BOOTSTRAP_TOKEN from .env>'
$body = @{ email = 'admin@example.com'; displayName = 'Admin' } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8787/v1/bootstrap -Method Post -Headers @{ 'X-Bootstrap-Token' = $bootstrap } -ContentType 'application/json' -Body $body
```

Set the returned administrator token temporarily:

```powershell
$token = '<returned ch_ token>'
$headers = @{ Authorization = "Bearer $token" }
```

## 3. Create a project, repository, and users

```powershell
Invoke-RestMethod http://127.0.0.1:8787/v1/projects -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ projectKey = 'orders'; name = 'Orders' } | ConvertTo-Json)

Invoke-RestMethod http://127.0.0.1:8787/v1/projects/orders/repositories -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ owner = 'your-github-org'; repository = 'orders-api' } | ConvertTo-Json)

Invoke-RestMethod http://127.0.0.1:8787/v1/projects/orders/members -Method Post -Headers $headers -ContentType 'application/json' -Body (@{ email = 'frontend@example.com'; displayName = 'Frontend'; role = 'frontend' } | ConvertTo-Json)
```

When a new member is added, the response includes a one-time personal token. Transfer it through an approved secret channel, not a handoff message.

## 4. Connect Codex clients

Each collaborator configures their own token and restarts Codex so its MCP process inherits the values:

```powershell
[Environment]::SetEnvironmentVariable('COLLAB_HANDOFF_HUB_URL', 'https://handoff.example.internal', 'User')
[Environment]::SetEnvironmentVariable('COLLAB_HANDOFF_HUB_TOKEN', 'ch_personal_token', 'User')
```

From the checked-out source repository, install the plugin:

```powershell
codex plugin marketplace add .
codex plugin add collab-handoff@collab-handoff-community
```

Backend Codex publishes a Handoff using the project key, registered GitHub repository, commit SHA, and contract file path. Frontend Codex lists the project inbox, reads the immutable contract snapshot through `contract_get`, and appends its reply. For a frontend blocker that is not tied to an existing contract, use `assistance_request_create`; backend follow-up uses `assistance_request_reply` and stays in the same Hub. The service, not a chat transcript, becomes the handoff record.

## Security and operations

- Run behind HTTPS; do not expose port 8787 directly to the public internet.
- Use a GitHub token with read-only access to only the required repositories.
- Rotate `HUB_BOOTSTRAP_TOKEN` after bootstrapping; it is not a user token.
- Back up PostgreSQL and test restores before upgrades.
- Personal tokens are stored only as SHA-256 hashes. Revoke/rotation endpoints and OIDC are planned follow-up work; treat v1 as a trusted-team deployment.
