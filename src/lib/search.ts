import { Prisma } from "@prisma/client";
import { db } from "./db";
export type SearchHit = {
  id: string;
  type: string;
  title: string;
  detail: string;
  url: string;
};
export function searchPattern(q: string) {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}
export async function searchHousehold(query: string): Promise<SearchHit[]> {
  const pattern = searchPattern(query);
  return db.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; kind: string; data: Prisma.JsonObject }[]
      >`
      SELECT id, kind, data FROM "Record" r
      WHERE "deletedAt" IS NULL AND kind IN ('event', 'item', 'list', 'restaurant', 'voteSession', 'watchSession')
      AND (data->>'name' ILIKE ${pattern} OR data->>'title' ILIKE ${pattern} OR data->>'notes' ILIKE ${pattern}
        OR data->>'location' ILIKE ${pattern} OR data->>'address' ILIKE ${pattern} OR data->>'cuisine' ILIKE ${pattern}
        OR data->>'store' ILIKE ${pattern} OR data->>'category' ILIKE ${pattern})
      AND (kind != 'item' OR EXISTS (SELECT 1 FROM "Record" p WHERE p.id = r.data->>'listId' AND p."deletedAt" IS NULL))
      ORDER BY "updatedAt" DESC LIMIT 60`;
      const files = await tx.attachment.findMany({
        where: { filename: { contains: query, mode: "insensitive" } },
        take: 30,
        orderBy: { createdAt: "desc" },
      });
      const eventIds = files.map((f) => f.eventId);
      const events = await tx.record.findMany({
        where: { id: { in: eventIds }, kind: "event", deletedAt: null },
        select: { id: true, data: true },
      });
      const eventMap = new Map(
        events.map((e) => [e.id, e.data as Prisma.JsonObject]),
      );
      const media = await tx.mediaRequest.findMany({
        where: { title: { contains: query, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return [
        ...rows.map((r) => ({
          id: r.id,
          type:
            r.kind === "watchSession"
              ? "Watch vote"
              : r.kind === "voteSession"
                ? "Food vote"
                : r.kind === "item"
                  ? "Shopping item"
                  : r.kind[0].toUpperCase() + r.kind.slice(1),
          title: String(r.data.title || r.data.name),
          detail: String(
            r.data.location ||
              r.data.address ||
              r.data.store ||
              r.data.notes ||
              r.data.cuisine ||
              "",
          ).slice(0, 300),
          url:
            r.kind === "event"
              ? `/calendar?event=${r.id}`
              : r.kind === "item"
                ? `/shopping?list=${encodeURIComponent(String(r.data.listId))}#${r.id}`
                : r.kind === "list"
                  ? `/shopping?list=${r.id}`
                  : r.kind === "restaurant"
                    ? `/food?restaurant=${r.id}#${r.id}`
                    : r.kind === "voteSession"
                      ? `/food#${r.id}`
                      : `/media?tab=watch#${r.id}`,
        })),
        ...files
          .filter((f) => eventMap.has(f.eventId))
          .map((f) => ({
            id: f.id,
            type: "Attachment",
            title: f.filename,
            detail: String(
              eventMap.get(f.eventId)?.title || "Event attachment",
            ),
            url: `/calendar?event=${f.eventId}&attachment=${f.id}`,
          })),
        ...media.map((m) => ({
          id: m.id,
          type: "Media request",
          title: m.title,
          detail: m.status,
          url: `/media?tab=requests#${m.id}`,
        })),
      ];
    },
    { isolationLevel: "RepeatableRead" },
  );
}
