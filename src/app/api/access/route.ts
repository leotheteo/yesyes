import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { newToken, tokenHash } from "@/lib/crypto";
import { body, failure, json, origin, owner, rate } from "@/lib/http";
import { assert } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    origin(request);
    const payload = z
      .object({
        action: z.enum(["invite", "reset", "redeem"]),
        email: z.email().optional(),
        token: z.string().max(200).optional(),
        name: z.string().trim().min(1).max(100).optional(),
        password: z.string().min(12).max(128).optional(),
      })
      .parse(await body(request));
    if (payload.action !== "redeem") {
      const user = await owner();
      await rate(`links:${user.id}`, 20);
      assert(payload.email, 400, "Enter an email address.");
      const email = payload.email.toLowerCase();
      const existing = await db.user.findUnique({ where: { email } });
      assert(
        payload.action === "reset" ? existing : !existing,
        400,
        payload.action === "reset"
          ? "No account has this email."
          : "This email already has an account.",
      );
      const token = newToken();
      await db.accessLink.create({
        data: {
          kind: payload.action,
          email,
          userId: existing?.id,
          tokenHash: tokenHash(token),
          expiresAt: new Date(
            Date.now() + (payload.action === "invite" ? 7 : 1) * 86400000,
          ),
        },
      });
      return json({
        url: `${process.env.BETTER_AUTH_URL}/join?token=${token}`,
      });
    }
    // Global limit avoids trusting proxy-provided IP headers for unauthenticated writes.
    await rate("redeem", 30);
    assert(
      payload.token && payload.password,
      400,
      "A valid link and a password of at least 12 characters are required.",
    );
    const hash = await hashPassword(payload.password);
    await db.$transaction(async (tx) => {
      await tx.household.update({
        where: { id: "family" },
        data: { revision: { increment: 1 } },
      });
      const link = await tx.accessLink.findUnique({
        where: { tokenHash: tokenHash(payload.token!) },
      });
      assert(
        link && !link.usedAt && link.expiresAt > new Date(),
        400,
        "This link has expired or was used. Ask for a new link.",
      );
      const claimed = await tx.accessLink.updateMany({
        where: { id: link.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      assert(claimed.count === 1, 409, "This link has already been used.");
      if (link.kind === "reset") {
        assert(link.userId, 400, "This reset link is invalid.");
        await tx.account.updateMany({
          where: { userId: link.userId, providerId: "credential" },
          data: { password: hash },
        });
        await tx.session.deleteMany({ where: { userId: link.userId } });
        return;
      }
      assert(payload.name, 400, "Enter your name.");
      const house = await tx.household.findUniqueOrThrow({
        where: { id: "family" },
      });
      assert(
        link.kind === "invite" || !house.ownerId,
        409,
        "Setup is complete. Ask for an invitation.",
      );
      const email = link.email || payload.email?.toLowerCase();
      assert(email, 400, "Enter an email address.");
      const id = randomUUID();
      await tx.user.create({
        data: { id, email, name: payload.name!, emailVerified: false },
      });
      await tx.account.create({
        data: {
          id: randomUUID(),
          userId: id,
          accountId: id,
          providerId: "credential",
          password: hash,
        },
      });
      if (link.kind === "setup")
        await tx.household.update({
          where: { id: "family" },
          data: { ownerId: id },
        });
    });
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const link = await db.accessLink.findUnique({
      where: { tokenHash: tokenHash(token) },
    });
    assert(
      link && !link.usedAt && link.expiresAt > new Date(),
      400,
      "This link has expired or was used. Ask for a new link.",
    );
    return json({ kind: link.kind, email: link.email });
  } catch (e) {
    return failure(e);
  }
}
