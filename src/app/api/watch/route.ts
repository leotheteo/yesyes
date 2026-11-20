import { z } from "zod";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assert } from "@/lib/errors";
import { body, failure, json, member, origin, rate } from "@/lib/http";
import { dateOnly, eventSchema, watchSessionSchema } from "@/lib/models";
import { jellyfinId, libraryItem } from "@/lib/jellyfin";
import { TIME_ZONE } from "@/lib/calendar";
export async function POST(request: Request) {
  try {
    origin(request);
    const user = await member();
    await rate(`watch:${user.id}`, 90);
    const input = z
      .object({
        action: z.enum(["create", "nominate", "vote", "schedule", "withdraw"]),
        id: z.string().optional(),
        revision: z.number().int().positive().optional(),
        title: z.string().trim().min(1).max(200).optional(),
        closesAt: z.iso.datetime().optional(),
        itemId: jellyfinId.optional(),
        date: dateOnly.optional(),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .optional(),
        location: z.string().trim().max(500).optional(),
      })
      .parse(await body(request));
    const item =
      ["nominate", "schedule"].includes(input.action) && input.itemId
        ? await libraryItem(user.id, input.itemId)
        : null;
    const result = await db.$transaction(async (tx) => {
      await tx.household.update({
        where: { id: "family" },
        data: { revision: { increment: 1 } },
      });
      if (input.action === "create") {
        assert(
          input.title &&
            input.closesAt &&
            new Date(input.closesAt) > new Date(),
          400,
          "Enter a title and a future closing time.",
        );
        const data = watchSessionSchema.parse({
          title: input.title,
          closesAt: input.closesAt,
        });
        return tx.record.create({
          data: { kind: "watchSession", createdBy: user.id, data },
        });
      }
      assert(
        input.id && input.revision,
        400,
        "Choose a watch vote and its current revision.",
      );
      const row = await tx.record.findFirst({
        where: { id: input.id, kind: "watchSession", deletedAt: null },
      });
      assert(row, 404, "This watch vote no longer exists. Reload the page.");
      assert(
        row.revision === input.revision,
        409,
        "Someone changed this watch vote. Refresh and try again.",
      );
      const data = watchSessionSchema.parse(row.data);
      assert(
        !data.eventId,
        409,
        "This movie night is already scheduled. Edit its event in Calendar.",
      );
      if (input.action === "schedule") {
        assert(
          row.createdBy === user.id,
          403,
          "Only the creator can schedule this movie night.",
        );
        assert(
          input.itemId && input.date && input.time,
          400,
          "Choose a nominated title, date, and time.",
        );
        const nomination = data.nominations.find(
          (n) => n.itemId === input.itemId,
        );
        assert(nomination && item, 400, "Choose an available nominated title.");
        const counts = data.nominations.map(
          (n) => Object.values(data.votes).filter((v) => v === n.itemId).length,
        );
        assert(
          Object.values(data.votes).filter((v) => v === input.itemId).length ===
            Math.max(...counts),
          409,
          "Choose a title with the most votes. For a tie, choose any tied title.",
        );
        const instant = fromZonedTime(
          `${input.date}T${input.time}:00`,
          TIME_ZONE,
        );
        assert(
          instant > new Date() &&
            formatInTimeZone(instant, TIME_ZONE, "yyyy-MM-dd'T'HH:mm") ===
              `${input.date}T${input.time}`,
          400,
          "Choose a future Pacific time that exists on this date.",
        );
        const event = eventSchema.parse({
          title: data.title,
          category: "Gathering",
          date: input.date,
          time: input.time,
          location: input.location || "",
          notes: `Watch ${nomination.title}.`,
        });
        const calendar = await tx.record.create({
          data: {
            kind: "event",
            createdBy: user.id,
            data: event as Prisma.InputJsonValue,
          },
        });
        data.eventId = calendar.id;
        data.selectedId = input.itemId;
      } else {
        assert(
          new Date(data.closesAt) > new Date(),
          409,
          "Voting has closed. The creator can schedule the result.",
        );
        if (input.action === "nominate") {
          assert(
            item && ["Movie", "Episode"].includes(item.Type),
            400,
            "Nominate a movie or a specific episode from Jellyfin.",
          );
          assert(
            !data.nominations.some((n) => n.itemId === item.Id),
            409,
            "This title is already nominated.",
          );
          assert(
            data.nominations.length < 50,
            409,
            "This vote has reached its 50-title limit.",
          );
          data.nominations.push({
            itemId: item.Id,
            title: item.Name,
            type: item.Type as "Movie" | "Episode",
            proposedBy: user.id,
          });
        } else if (input.action === "vote") {
          assert(
            input.itemId &&
              data.nominations.some((n) => n.itemId === input.itemId),
            400,
            "Choose a nominated title.",
          );
          data.votes[user.id] = input.itemId;
        } else delete data.votes[user.id];
      }
      return tx.record.update({
        where: { id: row.id },
        data: { data, revision: { increment: 1 } },
      });
    });
    return json(result);
  } catch (e) {
    return failure(e);
  }
}
