import { z } from "zod";
import { db } from "@/lib/db";
import { body, failure, json, member, origin } from "@/lib/http";
export async function POST(request: Request) {
  try {
    origin(request);
    const user = await member();
    const input = z
      .object({ id: z.string().optional() })
      .parse(await body(request));
    await db.$transaction(async (tx) => {
      await tx.household.update({
        where: { id: "family" },
        data: { revision: { increment: 1 } },
      });
      await tx.notification.updateMany({
        where: { userId: user.id, ...(input.id ? { id: input.id } : {}) },
        data: { read: true },
      });
    });
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
