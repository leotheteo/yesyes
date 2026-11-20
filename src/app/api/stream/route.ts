import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { failure, member } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await member();
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const close = () => {
          if (!closed) {
            closed = true;
            clearTimeout(timer);
            try {
              controller.close();
            } catch {}
          }
        };
        request.signal.addEventListener("abort", close, { once: true });
        const tick = async () => {
          try {
            if (closed) return;
            const session = await auth.api.getSession({
              headers: request.headers,
            });
            if (!session) {
              close();
              return;
            }
            const household = await db.household.findUnique({
              where: { id: "family" },
              select: { revision: true },
            });
            if (closed) return;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ revision: household?.revision ?? 0 })}\n\n`,
              ),
            );
          } catch {
            close();
            return;
          }
          timer = setTimeout(tick, 2000);
        };
        void tick();
      },
      cancel() {
        closed = true;
        clearTimeout(timer);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
