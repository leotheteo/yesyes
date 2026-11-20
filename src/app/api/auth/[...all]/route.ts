import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { body, failure, rate } from "@/lib/http";
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  let forwarded = request;
  if (new URL(request.url).pathname.endsWith("/sign-in/email")) {
    try {
      await rate("sign-in-access", 120);
      const payload = (await body(request)) as {
        email?: unknown;
      } | null;
      const headers = new Headers(request.headers);
      headers.delete("content-length");
      forwarded = new Request(request.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: request.signal,
      });
      const account =
        payload && typeof payload.email === "string"
          ? await db.user.findUnique({
              where: { email: payload.email.toLowerCase().trim() },
              select: { disabled: true },
            })
          : null;
      if (account?.disabled)
        return Response.json(
          {
            error:
              "This account no longer has access. Ask for access before signing in again.",
          },
          { status: 403 },
        );
    } catch (error) {
      return failure(error);
    }
  }
  return handlers.POST(forwarded);
}
