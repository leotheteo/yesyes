import { z } from "zod";
import { body, failure, json, member, origin, rate } from "@/lib/http";
import { recentlyAdded, seerr, type SeerrMedia } from "@/lib/integrations";
import { requestMedia } from "@/lib/media";
export async function GET(request: Request) {
  try {
    const user = await member();
    await rate(`media:${user.id}`, 90);
    const url = new URL(request.url);
    if (url.searchParams.get("recent") === "1")
      return json(await recentlyAdded(user.id));
    if (url.searchParams.has("id")) {
      const id = z.coerce
        .number()
        .int()
        .positive()
        .parse(url.searchParams.get("id"));
      const type = z.enum(["movie", "tv"]).parse(url.searchParams.get("type"));
      const detail = await seerr<SeerrMedia>(`/${type}/${id}`);
      return json({
        id: detail.id,
        title: detail.title || detail.name,
        seasons:
          detail.seasons
            ?.filter((s) => s.seasonNumber > 0)
            .map((s) => ({ number: s.seasonNumber, name: s.name })) || [],
      });
    }
    const q = z
      .string()
      .trim()
      .min(2)
      .max(200)
      .parse(url.searchParams.get("q"));
    const result = await seerr<{ results: SeerrMedia[] }>(
      `/search?query=${encodeURIComponent(q)}&page=1`,
    );
    return json(
      result.results
        .filter((r) => ["movie", "tv"].includes(r.mediaType || ""))
        .map((r) => ({
          id: r.id,
          title: r.title || r.name,
          overview: r.overview,
          type: r.mediaType,
          status: r.mediaInfo?.status,
        })),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    origin(request);
    const user = await member();
    await rate(`request:${user.id}`, 20);
    const value = z
      .object({
        tmdbId: z.number().int().positive(),
        mediaType: z.enum(["movie", "tv"]),
        season: z.number().int().min(0).default(0),
      })
      .parse(await body(request));
    if (value.mediaType === "movie") value.season = 0;
    return json(await requestMedia(value, user.id));
  } catch (e) {
    return failure(e);
  }
}
