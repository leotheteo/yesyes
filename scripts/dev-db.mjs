import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
const pg = new EmbeddedPostgres({
  databaseDir: "./test-data/postgres",
  user: "family",
  password: "local-development-only",
  port: 55432,
  persistent: true,
  autoRehydrateSymlinks: true,
  onLog: () => {},
});
if (!existsSync("./test-data/postgres/PG_VERSION")) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("family");
} catch (e) {
  if (!String(e).includes("already exists")) throw e;
}
console.log("Development PostgreSQL listening on 127.0.0.1:55432.");
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
