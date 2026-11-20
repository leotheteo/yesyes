import { z } from "zod";
import { db } from "@/lib/db";
import { assert } from "@/lib/errors";
import { body, failure, json, member, origin, rate } from "@/lib/http";
export async function GET() {
  try {
    const user = await member();
    const house = await db.household.findUniqueOrThrow({
      where: { id: "family" },
    });
    const isOwner = house.ownerId === user.id;
    const [accounts, sessions, links] = await db.$transaction([
      db.user.findMany({
        where: isOwner ? {} : { id: user.id },
        select: {
          id: true,
          name: true,
          email: true,
          disabled: true,
          jellyfinProfile: { select: { jellyfinUserId: true } },
        },
        orderBy: { name: "asc" },
      }),
      db.session.findMany({
        where: {
          ...(isOwner ? {} : { userId: user.id }),
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          userId: true,
          userAgent: true,
          ipAddress: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      db.accessLink.findMany({
        where: {
          ...(isOwner ? {} : { id: "none" }),
          kind: { in: ["invite", "reset"] },
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true, kind: true, email: true, expiresAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return json({
      accounts,
      sessions,
      links,
      ownerId: isOwner ? house.ownerId : undefined,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const user = await member();
    await rate(`accounts:${user.id}`, 30);
    const input = z
      .object({
        action: z.enum([
          "rename",
          "disable",
          "enable",
          "remove",
          "revokeSession",
          "revokeAll",
          "revokeLink",
        ]),
        userId: z.string().optional(),
        id: z.string().optional(),
        name: z.string().trim().min(1).max(100).optional(),
      })
      .parse(await body(request));
    await db.$transaction(async (tx) => {
      const house = await tx.household.update({
        where: { id: "family" },
        data: { revision: { increment: 1 } },
      });
      const isOwner = house.ownerId === user.id;
      if (input.action === "revokeLink") {
        assert(
          isOwner && input.id,
          403,
          "This link is not available for your account.",
        );
        await tx.accessLink.updateMany({
          where: { id: input.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        return;
      }
      if (input.action === "revokeSession") {
        assert(input.id, 400, "Choose a session.");
        const session = await tx.session.findUnique({
          where: { id: input.id },
        });
        assert(
          session && (isOwner || session.userId === user.id),
          403,
          "This session is not available for your account.",
        );
        await tx.session.delete({ where: { id: session.id } });
        return;
      }
      const targetId = input.userId || user.id;
      assert(
        isOwner ||
          (targetId === user.id &&
            ["rename", "revokeAll"].includes(input.action)),
        403,
        "This account is not available for your account.",
      );
      const target = await tx.user.findUnique({ where: { id: targetId } });
      assert(
        target,
        404,
        "Account no longer exists. Reload the accounts list.",
      );
      if (input.action === "rename") {
        assert(input.name, 400, "Enter a name.");
        await tx.user.update({
          where: { id: targetId },
          data: { name: input.name },
        });
      } else if (input.action === "revokeAll")
        await tx.session.deleteMany({ where: { userId: targetId } });
      else {
        assert(
          house.ownerId !== targetId,
          409,
          "The account that set up the hub must keep access.",
        );
        if (input.action === "enable")
          await tx.user.update({
            where: { id: targetId },
            data: { disabled: false },
          });
        else {
          await tx.session.deleteMany({ where: { userId: targetId } });
          await tx.accessLink.updateMany({
            where: {
              OR: [{ userId: targetId }, { email: target.email }],
              usedAt: null,
            },
            data: { usedAt: new Date() },
          });
          if (input.action === "disable")
            await tx.user.update({
              where: { id: targetId },
              data: { disabled: true },
            });
          else {
            await tx.notification.deleteMany({ where: { userId: targetId } });
            await tx.user.delete({ where: { id: targetId } });
          }
        }
      }
    });
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
