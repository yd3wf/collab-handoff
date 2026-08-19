# Contributing

## Principles

- The repository contract is authoritative; chat messages are summaries and review records.
- Keep the plugin framework- and vendor-neutral.
- Never add credentials, tokens, customer data, or absolute local paths to examples or fixtures.
- Keep `HANDOFF` messages concise and machine-readable enough to compare across sessions.

## Development

Validate the plugin before opening a pull request:

```powershell
.\scripts\validate.ps1
```

For changes to a skill, test from a new Codex thread after reinstalling the local plugin. Include the exact prompt and expected `HANDOFF` or `HANDOFF-REPLY` in the pull request description.

## Protocol changes

Treat field removals and changed semantics as breaking. Add optional fields first, update both skills and examples in the same change, and explain how older handoffs should be interpreted.
