import { z } from "zod";
import { db } from "./db";
import { assert, AppError } from "./errors";
import { connection, upstream } from "./integrations";
export const jellyfinId = z.string().regex(/^[a-zA-Z0-9-]{1,100}$/);
export type JellyfinItem = {
  Id: string;
  Name: string;
  Type: string;
  Overview?: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  CommunityRating?: number;
  OfficialRating?: string;
  Genres?: string[];
  ImageTags?: { Primary?: string };
  SeriesName?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  UserData?: {
    IsFavorite?: boolean;
    Played?: boolean;
    PlaybackPositionTicks?: number;
    PlayedPercentage?: number;
  };
};
export type LibraryItem = {
  id: string;
  title: string;
  type: string;
  overview: string;
  year?: number;
  minutes?: number;
  rating?: number;
  contentRating?: string;
  genres: string[];
  image: string | null;
  url: string;
  favorite: boolean;
  played: boolean;
  progress: number;
  series?: string;
  episode?: number;
  season?: number;
};
export async function jellyfin<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const c = await connection("jellyfin");
  if (init.method && init.method !== "GET") {
    let response: Response;
    try {
      response = await fetch(`${c.url!.replace(/\/$/, "")}${path}`, {
        ...init,
        headers: {
          "X-Emby-Token": c.key,
          "Content-Type": "application/json",
          ...init.headers,
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AppError(
        502,
        "Jellyfin could not be reached. Check the connection and try again.",
      );
    }
    assert(
      response.ok,
      502,
      `Jellyfin returned ${response.status}. Check the connection and try again.`,
    );
    return undefined as T;
  }
  return upstream<T>(`${c.url!.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { "X-Emby-Token": c.key, ...init.headers },
  });
}
export async function jellyfinProfile(userId: string, personal = false) {
  const c = await connection("jellyfin");
  const mapping = await db.jellyfinProfile.findUnique({ where: { userId } });
  assert(
    !personal || mapping,
    409,
    "Link your Jellyfin profile in Settings before changing favorites or watch history.",
  );
  const id = mapping?.jellyfinUserId || c.userId;
  assert(
    id,
    409,
    "Choose a default Jellyfin profile or link your account in Settings to browse the library.",
  );
  return { id: jellyfinId.parse(id), personal: !!mapping, connection: c };
}
export async function libraryItem(userId: string, itemId: string) {
  const profile = await jellyfinProfile(userId);
  return jellyfin<JellyfinItem>(
    `/Users/${encodeURIComponent(profile.id)}/Items/${encodeURIComponent(jellyfinId.parse(itemId))}`,
  );
}
export function mapItem(item: JellyfinItem, publicUrl: string): LibraryItem {
  const duration = item.RunTimeTicks || 0;
  return {
    id: item.Id,
    title: item.Name,
    type: item.Type,
    overview: item.Overview || "",
    year: item.ProductionYear,
    minutes: duration ? Math.round(duration / 600000000) : undefined,
    rating: item.CommunityRating,
    contentRating: item.OfficialRating,
    genres: item.Genres || [],
    image: item.ImageTags?.Primary
      ? `/api/jellyfin/images/${encodeURIComponent(item.Id)}`
      : null,
    url: `${publicUrl.replace(/\/$/, "")}/web/#/details?id=${encodeURIComponent(item.Id)}`,
    favorite: !!item.UserData?.IsFavorite,
    played: !!item.UserData?.Played,
    progress: Math.max(
      0,
      Math.min(
        100,
        item.UserData?.PlayedPercentage ??
          (duration
            ? ((item.UserData?.PlaybackPositionTicks || 0) / duration) * 100
            : 0),
      ),
    ),
    series: item.SeriesName,
    episode: item.IndexNumber,
    season: item.ParentIndexNumber,
  };
}
export async function browseJellyfin(
  userId: string,
  options: {
    view: string;
    q?: string;
    parent?: string;
    type?: string;
    filter?: string;
    page?: number;
  },
) {
  const profile = await jellyfinProfile(userId);
  assert(
    profile.personal ||
      (!["resume", "next"].includes(options.view) &&
        options.filter !== "favorites" &&
        options.filter !== "unwatched"),
    409,
    "Link your Jellyfin profile in Settings to see personal watch history and favorites.",
  );
  const q = new URLSearchParams({
    UserId: profile.id,
    Limit: "24",
    StartIndex: String(((options.page || 1) - 1) * 24),
    Fields: "Overview,Genres",
    EnableUserData: "true",
  });
  let endpoint = "/Items";
  if (options.view === "libraries") {
    const result = await jellyfin<{ Items: JellyfinItem[] }>(
      `/Users/${encodeURIComponent(profile.id)}/Views`,
    );
    return {
      items: result.Items.map((i) => ({ id: i.Id, title: i.Name })),
      total: result.Items.length,
      personal: profile.personal,
    };
  }
  if (options.view === "resume") endpoint = "/Items/Resume";
  else if (options.view === "next") endpoint = "/Shows/NextUp";
  else if (options.view === "episodes") {
    assert(options.parent, 400, "Choose a series.");
    endpoint = `/Shows/${encodeURIComponent(jellyfinId.parse(options.parent))}/Episodes`;
  } else {
    q.set("Recursive", "true");
    q.set(
      "IncludeItemTypes",
      options.type === "Series"
        ? "Series"
        : options.type === "Movie"
          ? "Movie"
          : "Movie,Series",
    );
    q.set("SortBy", options.q ? "SortName" : "DateCreated,SortName");
    q.set("SortOrder", "Descending");
    if (options.q) q.set("SearchTerm", options.q);
    if (options.parent) q.set("ParentId", jellyfinId.parse(options.parent));
    if (options.filter === "favorites") q.set("Filters", "IsFavorite");
    if (options.filter === "unwatched") q.set("IsPlayed", "false");
  }
  const result = await jellyfin<{
    Items: JellyfinItem[];
    TotalRecordCount?: number;
  }>(`${endpoint}?${q}`);
  return {
    items: result.Items.map((i) =>
      mapItem(
        profile.personal ? i : { ...i, UserData: undefined },
        profile.connection.publicUrl || profile.connection.url!,
      ),
    ),
    total: result.TotalRecordCount ?? result.Items.length,
    personal: profile.personal,
  };
}
