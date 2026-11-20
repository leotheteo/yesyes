import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { assert } from "@/lib/errors";
import { failure, json, member, origin, rate } from "@/lib/http";
import { inspectFile, limitedForm, removeFile, saveFile } from "@/lib/uploads";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let written: string | null = null;
  try {
    origin(request);
    const user = await member();
    await rate(`upload:${user.id}`, 20);
    const form = await limitedForm(request);
    const file = form.get("file");
    const eventId = String(form.get("eventId") || "");
    assert(file instanceof File, 400, "Choose a file to upload.");
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = await inspectFile(buffer, file.name);
    const key = randomUUID();
    const result = await db.$transaction(
      async (tx) => {
        await tx.household.update({
          where: { id: "family" },
          data: { revision: { increment: 1 } },
        });
        assert(
          await tx.record.findFirst({
            where: { id: eventId, kind: "event", deletedAt: null },
          }),
          404,
          "Event no longer exists. Refresh and try again.",
        );
        assert(
          (await tx.attachment.count({ where: { eventId } })) < 50,
          409,
          "This event has reached its 50-file limit. Remove a file first.",
        );
        await saveFile(key, buffer);
        written = key;
        return tx.attachment.create({
          data: {
            id: randomUUID(),
            eventId,
            filename: file.name
              .replace(/[\r\n\x00-\x1f/\\]/g, "_")
              .slice(0, 200),
            contentType,
            size: buffer.length,
            storageKey: key,
            uploadedBy: user.id,
          },
        });
      },
      { timeout: 15000 },
    );
    written = null;
    return json(result);
  } catch (e) {
    if (written) await removeFile(written);
    return failure(e);
  }
}
