#!/usr/bin/env node
import { createDatabase } from "./database.mjs";
import { GitHubContractSource } from "./github.mjs";
import { migrate } from "./migrate.mjs";
import { createHubServer } from "./server.mjs";
import { HubService } from "./service.mjs";

const options = {
  host: "127.0.0.1",
  port: 8787,
  bootstrapToken: process.env.HUB_BOOTSTRAP_TOKEN || ""
};
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key === "--host") options.host = value;
  else if (key === "--port") options.port = Number(value);
  else if (key === "--bootstrap-token") options.bootstrapToken = value;
  else throw new Error(`Unknown option: ${key}`);
}

if (!options.bootstrapToken) throw new Error("HUB_BOOTSTRAP_TOKEN is required");
const db = createDatabase(process.env.DATABASE_URL);
await migrate(db.sql);
const service = new HubService({ sql: db.sql, contractSource: new GitHubContractSource(process.env.GITHUB_TOKEN) });
const server = createHubServer({ service, bootstrapToken: options.bootstrapToken });
server.listen(options.port, options.host, () => {
  console.log(`Collab Handoff Hub listening on http://${options.host}:${options.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    await db.close();
    process.exit(0);
  });
}
