import { connection } from "@/lib/integrations";
import { jellyfinId, libraryItem } from "@/lib/jellyfin";
import { assert } from "@/lib/errors";
import { failure, member } from "@/lib/http";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await member();
    const id = jellyfinId.parse((await context.params).id);
    await libraryItem(user.id, id);
    const c = await connection("jellyfin");
    const response = await fetch(
      `${c.url!.replace(/\/$/, "")}/Items/${encodeURIComponent(id)}/Images/Primary?maxWidth=360&quality=85`,
      {
        headers: { "X-Emby-Token": c.key },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    assert(
      response.ok,
      502,
      "Poster could not be loaded. Open the title in Jellyfin.",
    );
    const type = response.headers.get("content-type")?.split(";")[0] || "";
    assert(
      ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(type),
      502,
      "Poster format is not supported.",
    );
    return new Response(response.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
