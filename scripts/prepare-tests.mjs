import "dotenv/config";
import pg from "pg";
import { spawnSync } from "node:child_process";
const url = new URL(
  process.env.TEST_DATABASE_URL ||
    "postgresql://family:local-development-only@127.0.0.1:55432/family_e2e",
);
if (url.pathname !== "/family_e2e")
  throw new Error(
    "End-to-end tests require the dedicated family_e2e database.",
  );
const managementUrl = new URL(url);
managementUrl.pathname = "/postgres";
const client = new pg.Client({ connectionString: managementUrl.toString() });
await client.connect();
try {
  await client.query("CREATE DATABASE family_e2e");
} catch (e) {
  if (e.code !== "42P04") throw e;
} finally {
  await client.end();
}
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit", env: { ...process.env, DATABASE_URL: url.toString() } },
);
process.exitCode = result.status ?? 1;
