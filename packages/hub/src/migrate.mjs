import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDatabase } from "./database.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export async function migrate(sql) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const versions = ["001_initial", "002_assistance_requests"];
  let applied = false;
  for (const version of versions) {
    const [existing] = await sql`SELECT version FROM schema_migrations WHERE version = ${version}`;
    if (existing) continue;
    const migration = await readFile(join(here, `../migrations/${version}.sql`), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
    });
    applied = true;
  }
  return applied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = createDatabase(process.env.DATABASE_URL);
  try {
    const applied = await migrate(db.sql);
    console.log(applied ? "Applied pending migrations" : "Database schema is current");
  } finally {
    await db.close();
  }
}
