import postgres from "postgres";

export function createDatabase(connectionString) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const sql = postgres(connectionString, { max: 10, idle_timeout: 20 });
  return { sql, close: () => sql.end({ timeout: 5 }) };
}
