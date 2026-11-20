import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { body, failure, json, origin, owner, rate } from "@/lib/http";
import { integrationSchema } from "@/lib/integrations";
export async function POST(request: Request) {
  try {
    origin(request);
    const user = await owner();
    await rate(`settings:${user.id}`, 30);
    const input = await body(request);
    const removal = z
      .object({ remove: z.enum(["seerr", "jellyfin", "google"]) })
      .safeParse(input);
    if (removal.success) {
      await db.$transaction(async (tx) => {
        await tx.household.update({
          where: { id: "family" },
          data: { revision: { increment: 1 } },
        });
        await tx.integration.deleteMany({ where: { id: removal.data.remove } });
      });
    } else {
      const value = integrationSchema.parse(input);
      await db.$transaction(async (tx) => {
        await tx.household.update({
          where: { id: "family" },
          data: { revision: { increment: 1 } },
        });
        await tx.integration.upsert({
          where: { id: value.id },
          create: { id: value.id, encrypted: encrypt(value) },
          update: { encrypted: encrypt(value) },
        });
      });
    }
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
