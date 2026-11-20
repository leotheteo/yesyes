import { Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { assert } from "./errors";
import { candidates, weightedPick } from "./food";
import {
  kindSchema,
  schemas,
  type VoteSession,
  type Restaurant,
  type Preference,
} from "./models";

const inputSchema = z.object({
  action: z.enum([
    "create",
    "update",
    "delete",
    "restore",
    "preference",
    "vote",
    "veto",
    "draw",
    "finalize",
    "visit",
    "exception",
  ]),
  kind: kindSchema,
  id: z.string().optional(),
  revision: z.number().int().positive().optional(),
  data: z.unknown().optional(),
});
export async function mutate(input: unknown, userId: string) {
  const command = inputSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      // One household row serializes writes, including cross-record rules and SSE revisions.
      await tx.household.update({
        where: { id: "family" },
        data: { revision: { increment: 1 } },
      });
      if (command.action === "preference") {
        const data = schemas.preference.parse(command.data);
        assert(
          data.userId === userId,
          403,
          "Only your own preferences can be changed.",
        );
        const restaurant = await tx.record.findFirst({
          where: { id: data.restaurantId, kind: "restaurant", deletedAt: null },
        });
        assert(
          restaurant,
          404,
          "Restaurant no longer exists. Refresh and try again.",
        );
        const id = `preference:${userId}:${data.restaurantId}`;
        return tx.record.upsert({
          where: { id },
          create: { id, kind: "preference", createdBy: userId, data },
          update: { data, revision: { increment: 1 }, deletedAt: null },
        });
      }
      if (command.action === "create") {
        assert(
          !["preference"].includes(command.kind),
          400,
          "Use the preference action.",
        );
        let data: unknown = schemas[command.kind].parse(command.data);
        if (command.kind === "voteSession") {
          const s = data as VoteSession;
          assert(
            new Date(s.closesAt) > new Date(),
            400,
            "Choose a future closing time.",
          );
          const count = await tx.user.count({
            where: { id: { in: s.participants } },
          });
          assert(
            count === new Set(s.participants).size,
            400,
            "Select existing family members.",
          );
          data = {
            ...s,
            votes: {},
            vetoes: {},
            draws: [],
            selectedId: null,
            finalized: false,
            visited: false,
          };
        }
        if (command.kind === "restaurant")
          data = { ...schemas.restaurant.parse(data), visits: [] };
        if (command.kind === "item") {
          const item = schemas.item.parse(data);
          assert(
            await tx.record.findFirst({
              where: { id: item.listId, kind: "list", deletedAt: null },
            }),
            404,
            "List no longer exists. Refresh and try again.",
          );
        }
        return tx.record.create({
          data: {
            kind: command.kind,
            createdBy: userId,
            data: data as Prisma.InputJsonValue,
          },
        });
      }
      assert(
        command.id && command.revision,
        400,
        "A record and revision are required.",
      );
      const record = await tx.record.findUnique({ where: { id: command.id } });
      assert(
        record && record.kind === command.kind,
        404,
        "This record no longer exists. Refresh and try again.",
      );
      assert(
        record.revision === command.revision,
        409,
        "Someone changed this item. Refresh and try again.",
      );
      assert(
        !record.deletedAt || command.action === "restore",
        409,
        "This item was deleted. Refresh to see the current list.",
      );
      if (command.action === "delete" || command.action === "restore") {
        assert(
          !["preference", "voteSession"].includes(command.kind),
          400,
          "This record cannot be deleted here.",
        );
        if (command.kind === "list") {
          const items = await tx.record.findMany({
            where: { kind: "item", deletedAt: null },
          });
          assert(
            !items.some((i) => schemas.item.parse(i.data).listId === record.id),
            409,
            "Remove the list's items first.",
          );
        }
        if (command.action === "restore" && command.kind === "item") {
          const item = schemas.item.parse(record.data);
          assert(
            await tx.record.findFirst({
              where: { id: item.listId, deletedAt: null },
            }),
            409,
            "Restore the list before restoring this item.",
          );
        }
        return tx.record.update({
          where: { id: record.id },
          data: {
            deletedAt: command.action === "delete" ? new Date() : null,
            revision: { increment: 1 },
          },
        });
      }
      if (command.action === "update") {
        assert(
          ["list", "item", "restaurant", "event"].includes(command.kind),
          400,
          "Use a dedicated action to change this record.",
        );
        let data = schemas[command.kind].parse(command.data);
        if (command.kind === "restaurant")
          data = {
            ...data,
            visits: schemas.restaurant.parse(record.data).visits,
          } as Restaurant;
        if (command.kind === "item")
          assert(
            schemas.item.parse(data).listId ===
              schemas.item.parse(record.data).listId,
            400,
            "An item cannot move between lists.",
          );
        return tx.record.update({
          where: { id: record.id },
          data: {
            data: data as Prisma.InputJsonValue,
            revision: { increment: 1 },
          },
        });
      }
      if (command.action === "exception") {
        assert(command.kind === "event", 400, "Choose an event.");
        const event = schemas.event.parse(record.data);
        const parsed = z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            cancelled: z.boolean(),
            patch: z.unknown().optional(),
          })
          .parse(command.data);
        const { eventPatchSchema } = await import("./models");
        const entry = {
          date: parsed.date,
          cancelled: parsed.cancelled,
          patch: parsed.patch
            ? eventPatchSchema.parse(parsed.patch)
            : undefined,
        };
        if (entry.patch)
          schemas.event.parse({ ...event, ...entry.patch, exceptions: [] });
        const updated = schemas.event.parse({
          ...event,
          exceptions: [
            ...event.exceptions.filter((e) => e.date !== parsed.date),
            entry,
          ],
        });
        return tx.record.update({
          where: { id: record.id },
          data: {
            data: JSON.parse(JSON.stringify(updated)),
            revision: { increment: 1 },
          },
        });
      }
      assert(command.kind === "voteSession", 400, "Choose a food vote.");
      const s = schemas.voteSession.parse(record.data);
      const payload = z
        .object({
          restaurantId: z.string().optional(),
          vote: z.enum(["yes", "neutral", "no"]).optional(),
        })
        .parse(command.data ?? {});
      assert(
        !s.finalized || command.action === "visit",
        409,
        "This vote is finalized. Start another vote.",
      );
      const participating = s.participants.includes(userId);
      if (["vote", "veto"].includes(command.action)) {
        assert(participating, 403, "You are not a participant in this vote.");
        assert(new Date(s.closesAt) > new Date(), 409, "Voting has closed.");
        assert(payload.restaurantId, 400, "Choose a restaurant.");
        assert(
          await tx.record.findFirst({
            where: {
              id: payload.restaurantId,
              kind: "restaurant",
              deletedAt: null,
            },
          }),
          404,
          "Restaurant is no longer available.",
        );
        if (command.action === "vote") {
          assert(payload.vote, 400, "Choose a vote.");
          s.votes[userId] = {
            ...s.votes[userId],
            [payload.restaurantId]: payload.vote,
          };
        } else {
          assert(!s.vetoes[userId], 409, "You have already used your veto.");
          s.vetoes[userId] = payload.restaurantId;
          if (s.selectedId === payload.restaurantId) s.selectedId = null;
        }
      } else {
        assert(
          participating || record.createdBy === userId,
          403,
          "Only participants or the vote creator can choose the result.",
        );
        if (command.action === "draw") {
          const rows = await tx.record.findMany({
            where: {
              kind: { in: ["restaurant", "preference"] },
              deletedAt: null,
            },
          });
          const options = candidates(
            s,
            rows
              .filter((r) => r.kind === "restaurant")
              .map((r) => ({ id: r.id, data: r.data as Restaurant })),
            rows
              .filter((r) => r.kind === "preference")
              .map((r) => r.data as Preference),
          );
          const pick = weightedPick(
            options.filter((o) => !o.reasons.length),
            randomInt(0, 2 ** 48 - 1) / (2 ** 48 - 1),
          );
          assert(
            pick,
            409,
            "No eligible restaurants remain. Change preferences or start another vote.",
          );
          s.selectedId = pick.id;
          s.draws.push(pick.id);
        } else if (command.action === "finalize") {
          assert(s.selectedId, 400, "Draw a restaurant first.");
          const rows = await tx.record.findMany({
            where: {
              kind: { in: ["restaurant", "preference"] },
              deletedAt: null,
            },
          });
          const check = candidates(
            { ...s, draws: [] },
            rows
              .filter((r) => r.kind === "restaurant")
              .map((r) => ({ id: r.id, data: r.data as Restaurant })),
            rows
              .filter((r) => r.kind === "preference")
              .map((r) => r.data as Preference),
          ).find((r) => r.id === s.selectedId);
          assert(
            check && !check.reasons.length,
            409,
            "This choice is no longer eligible. Draw again.",
          );
          s.finalized = true;
        } else if (command.action === "visit") {
          assert(
            s.finalized && s.selectedId && !s.visited,
            409,
            "Finalize a choice first, or this visit is already recorded.",
          );
          const restaurant = await tx.record.findFirst({
            where: { id: s.selectedId, deletedAt: null },
          });
          assert(restaurant, 404, "Restaurant no longer exists.");
          const data = schemas.restaurant.parse(restaurant.data);
          data.visits = [...data.visits.slice(-999), new Date().toISOString()];
          await tx.record.update({
            where: { id: restaurant.id },
            data: { data, revision: { increment: 1 } },
          });
          s.visited = true;
        }
      }
      return tx.record.update({
        where: { id: record.id },
        data: { data: s as Prisma.InputJsonValue, revision: { increment: 1 } },
      });
    },
    { timeout: 15000 },
  );
}
