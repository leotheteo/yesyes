import { db } from "./db";
import { assert } from "./errors";
export async function attachment(id: string) {
  const file = await db.attachment.findUnique({ where: { id } });
  assert(file, 404, "File no longer exists. Refresh the event.");
  assert(
    await db.record.findFirst({
      where: { id: file.eventId, kind: "event", deletedAt: null },
    }),
    404,
    "Event no longer exists.",
  );
  return file;
}
