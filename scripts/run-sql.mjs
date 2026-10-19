#!/usr/bin/env node
// Runs a .sql file against the Supabase Postgres (session pooler) connection.
// Reads DATABASE_URL-style connection info from .env.local (SUPABASE_DB_URL),
// sanitizing the known repo gotcha where values contain literal `\n` sequences
// inside the quotes.
//
// Usage:
//   node scripts/run-sql.mjs <path-to-sql-file>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function sanitize(value) {
  let v = value.trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    v = v.slice(1, -1);
  }
  // Strip literal backslash-n sequences and real newlines that sometimes
  // sneak into .env.local values in this repo.
  v = v.replace(/\\n/g, "").replace(/\n/g, "");
  return v.trim();
}

function loadEnvLocal() {
  const envPath = path.join(repoRoot, ".env.local");
  const content = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1);
    env[key] = sanitize(rawValue);
  }
  return env;
}

async function main() {
  const sqlFileArg = process.argv[2];
  if (!sqlFileArg) {
    console.error("Usage: node scripts/run-sql.mjs <path-to-sql-file>");
    process.exit(1);
  }
  const sqlPath = path.isAbsolute(sqlFileArg)
    ? sqlFileArg
    : path.join(repoRoot, sqlFileArg);

  const sql = fs.readFileSync(sqlPath, "utf8");
  const env = loadEnvLocal();
  const connectionString = env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error("SUPABASE_DB_URL not found in .env.local");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    console.log(`Running ${path.relative(repoRoot, sqlPath)} ...`);
    const result = await client.query(sql);
    const results = Array.isArray(result) ? result : [result];
    for (const r of results) {
      if (r && r.command) {
        console.log(`-> ${r.command} (${r.rowCount ?? 0} rows)`);
      }
    }
    console.log("OK");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error running SQL:", err.message);
  process.exit(1);
});
