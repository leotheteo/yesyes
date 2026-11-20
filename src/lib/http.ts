import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { auth } from "./auth";
import { db } from "./db";
import { AppError, assert } from "./errors";

export async function member() {
  const session = await auth.api.getSession({ headers: await headers() });
  assert(session?.user, 401, "Sign in to continue.");
  const account = await db.user.findUnique({
    where: { id: session.user.id },
    select: { disabled: true },
  });
  assert(
    account && !account.disabled,
    401,
    "This account no longer has access. Ask for access before signing in again.",
  );
  return session.user;
}
export async function owner() {
  const user = await member();
  const house = await db.household.findUnique({ where: { id: "family" } });
  assert(
    house?.ownerId === user.id,
    403,
    "This setting is not available for your account.",
  );
  return user;
}
export function origin(request: Request) {
  const expected = new URL(
    process.env.BETTER_AUTH_URL || "http://localhost:3000",
  ).origin;
  assert(
    request.headers.get("origin") === expected,
    403,
    "Request origin did not match. Reload and try again.",
  );
}
export async function rate(key: string, max = 120) {
  const minute = Math.floor(Date.now() / 60000);
  const row = await db.rateBucket.upsert({
    where: { key: `${key}:${minute}` },
    create: {
      key: `${key}:${minute}`,
      expiresAt: new Date((minute + 2) * 60000),
    },
    update: { count: { increment: 1 } },
  });
  assert(row.count <= max, 429, "Too many requests. Try again in a minute.");
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return Response.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2034", "P2002"].includes(error.code)
  )
    return Response.json(
      { error: "Another change arrived first. Refresh and try again." },
      { status: 409 },
    );
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  return Response.json(
    { error: "Could not complete the request. Please try again." },
    { status: 500 },
  );
}
export async function body(request: Request) {
  assert(
    Number(request.headers.get("content-length") || 0) <= 128 * 1024,
    413,
    "Request is too large.",
  );
  const reader = request.body?.getReader();
  assert(reader, 400, "Request must contain valid JSON.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 128 * 1024) {
      await reader.cancel();
      throw new AppError(413, "Request is too large.");
    }
    chunks.push(part.value);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "Request must contain valid JSON.");
  }
  return value;
}
export const json = (value: unknown) =>
  Response.json(value, { headers: { "Cache-Control": "no-store" } });
