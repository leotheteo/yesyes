import { db } from "./db";
import { eventSchema } from "./models";
import { reminders } from "./calendar";
export async function produceReminders(now = new Date()) {
  return db.$transaction(
    async (tx) => {
      await tx.household.update({
        where: { id: "family" },
        data: { revision: { increment: 1 } },
      });
      const [events, people] = await Promise.all([
        tx.record.findMany({ where: { kind: "event", deletedAt: null } }),
        tx.user.findMany({ where: { disabled: false }, select: { id: true } }),
      ]);
      const data = events.flatMap((row) =>
        reminders(row.id, eventSchema.parse(row.data), now).flatMap((r) =>
          people.map((p) => ({
            userId: p.id,
            dedupeKey: `${p.id}:${r.key}`,
            title: `${r.event.title} · ${r.event.date}${r.event.allDay ? "" : ` at ${r.event.time} Pacific`}`,
            eventId: row.id,
          })),
        ),
      );
      return data.length
        ? (await tx.notification.createMany({ data, skipDuplicates: true }))
            .count
        : 0;
    },
    { timeout: 30000 },
  );
}
