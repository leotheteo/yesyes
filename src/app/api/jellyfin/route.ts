import { z } from "zod";
import { db } from "@/lib/db";
import { assert } from "@/lib/errors";
import { body, failure, json, member, origin, owner, rate } from "@/lib/http";
import {
  browseJellyfin,
  jellyfin,
  jellyfinId,
  jellyfinProfile,
  libraryItem,
  mapItem,
} from "@/lib/jellyfin";
export async function GET(request: Request) {
  try {
    const user = await member();
    await rate(`jellyfin:${user.id}`, 120);
    const url = new URL(request.url);
    const view = z
      .enum([
        "library",
        "libraries",
        "resume",
        "next",
        "episodes",
        "detail",
        "profiles",
      ])
      .parse(url.searchParams.get("view") || "library");
    if (view === "profiles") {
      await owner();
      const users =
        await jellyfin<
          { Id: string; Name: string; Policy?: { IsDisabled?: boolean } }[]
        >("/Users");
      return json(
        users
          .filter((u) => !u.Policy?.IsDisabled)
          .map((u) => ({ id: u.Id, name: u.Name })),
      );
    }
    if (view === "detail") {
      const id = jellyfinId.parse(url.searchParams.get("id"));
      const profile = await jellyfinProfile(user.id);
      const item = await libraryItem(user.id, id);
      return json({
        item: mapItem(
          profile.personal ? item : { ...item, UserData: undefined },
          profile.connection.publicUrl || profile.connection.url!,
        ),
        personal: profile.personal,
      });
    }
    const q = z
      .string()
      .trim()
      .max(200)
      .parse(url.searchParams.get("q") || "");
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(url.searchParams.get("page") || 1);
    const type = z
      .enum(["all", "Movie", "Series"])
      .parse(url.searchParams.get("type") || "all");
    const filter = z
      .enum(["all", "favorites", "unwatched"])
      .parse(url.searchParams.get("filter") || "all");
    return json(
      await browseJellyfin(user.id, {
        view,
        q,
        page,
        type,
        filter,
        parent: url.searchParams.get("parent") || undefined,
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const user = await member();
    await rate(`jellyfin-write:${user.id}`, 60);
    const input = z
      .object({
        action: z.enum(["profile", "favorite", "played"]),
        itemId: jellyfinId.optional(),
        value: z.boolean().optional(),
        userId: z.string().optional(),
        jellyfinUserId: jellyfinId.nullable().optional(),
      })
      .parse(await body(request));
    if (input.action === "profile") {
      await owner();
      assert(input.userId, 400, "Choose a family member.");
      if (input.jellyfinUserId)
        await jellyfin(`/Users/${encodeURIComponent(input.jellyfinUserId)}`);
      await db.$transaction(async (tx) => {
        await tx.household.update({
          where: { id: "family" },
          data: { revision: { increment: 1 } },
        });
        assert(
          await tx.user.findUnique({ where: { id: input.userId } }),
          404,
          "Account no longer exists.",
        );
        if (input.jellyfinUserId)
          await tx.jellyfinProfile.upsert({
            where: { userId: input.userId },
            create: {
              userId: input.userId!,
              jellyfinUserId: input.jellyfinUserId,
            },
            update: { jellyfinUserId: input.jellyfinUserId },
          });
        else
          await tx.jellyfinProfile.deleteMany({
            where: { userId: input.userId },
          });
      });
    } else {
      assert(
        input.itemId && typeof input.value === "boolean",
        400,
        "Choose a title and a value.",
      );
      const profile = await jellyfinProfile(user.id, true);
      await libraryItem(user.id, input.itemId);
      const part =
        input.action === "favorite" ? "FavoriteItems" : "PlayedItems";
      await jellyfin(
        `/Users/${encodeURIComponent(profile.id)}/${part}/${encodeURIComponent(input.itemId)}`,
        { method: input.value ? "POST" : "DELETE" },
      );
      await db.household.update({
        where: { id: "family" },
        data: { revision: { increment: 1 } },
      });
    }
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
