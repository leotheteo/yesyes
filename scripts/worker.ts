import "dotenv/config";
import { db } from "../src/lib/db";
import { produceReminders } from "../src/lib/reminder-worker";
import { reconcileMedia } from "../src/lib/media";

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
async function tick() {
  await produceReminders();
  await db.rateBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.accessLink.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 86400000) } },
  });
  await reconcileMedia();
}
async function main() {
  console.log("Family worker started. Timezone: America/Los_Angeles.");
  while (!stopping) {
    try {
      await tick();
    } catch (e) {
      console.error(
        "Worker cycle failed:",
        e instanceof Error ? e.name : "Unknown error",
      );
    }
    for (let i = 0; i < 60 && !stopping; i++)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await db.$disconnect();
}
void main();
