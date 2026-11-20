import { db } from "@/lib/db";
import { failure, json, member } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await member();
    const result = await db.$transaction(
      async (tx) => {
        const household = await tx.household.findUniqueOrThrow({
          where: { id: "family" },
        });
        const [
          people,
          records,
          attachments,
          notifications,
          requests,
          integrations,
        ] = await Promise.all([
          tx.user.findMany({
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
          }),
          tx.record.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
          }),
          tx.attachment.findMany({
            select: {
              id: true,
              eventId: true,
              filename: true,
              size: true,
              contentType: true,
              uploadedBy: true,
            },
          }),
          tx.notification.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
          tx.mediaRequest.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
          tx.integration.findMany({ select: { id: true } }),
        ]);
        const liveEvents = new Set(
          records.filter((r) => r.kind === "event").map((r) => r.id),
        );
        return {
          revision: household.revision,
          household: household.name,
          isOwner: household.ownerId === user.id,
          user: { id: user.id, name: user.name, email: user.email },
          people,
          records,
          attachments: attachments.filter((a) => liveEvents.has(a.eventId)),
          notifications,
          requests,
          integrations: integrations.map((i) => i.id),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
