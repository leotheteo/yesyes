import { z } from "zod";
import { db } from "./db";
import { decrypt } from "./crypto";
import { AppError, assert } from "./errors";
export const integrationSchema = z
  .object({
    id: z.enum(["seerr", "jellyfin", "google"]),
    url: z.string().url().optional(),
    key: z.string().min(1).max(1000),
    publicUrl: z.string().url().optional(),
    userId: z.string().max(100).optional(),
  })
  .refine((v) => v.id === "google" || !!v.url, "Enter a service URL.")
  .refine(
    (v) =>
      [v.url, v.publicUrl].filter(Boolean).every((u) => {
        const url = new URL(u!);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      }),
    "Use an HTTP or HTTPS URL without credentials, query, or fragment.",
  );
export type Connection = z.infer<typeof integrationSchema>;
export async function connection(id: string) {
  const row = await db.integration.findUnique({ where: { id } });
  assert(
    row,
    503,
    `Connect ${id === "google" ? "Google Places" : id === "seerr" ? "Seerr" : "Jellyfin"} in Settings first.`,
  );
  return decrypt<Connection>(row.encrypted);
}
export async function upstream<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok) {
      throw new AppError(
        502,
        response.status === 401 || response.status === 403
          ? "The service rejected its credentials. Check the connection in Settings."
          : `The service returned ${response.status}. Check the connection and try again.`,
      );
    }
    return (await response.json()) as T;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      502,
      "The service could not be reached. Check its address and try again.",
    );
  }
}
export async function seerr<T>(path: string, init: RequestInit = {}) {
  const c = await connection("seerr");
  return upstream<T>(`${c.url!.replace(/\/$/, "")}/api/v1${path}`, {
    ...init,
    headers: {
      "X-Api-Key": c.key,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}
export type SeerrMedia = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  posterPath?: string;
  mediaType?: string;
  mediaInfo?: { status: number; requests?: { id: number; status: number }[] };
  seasons?: { seasonNumber: number; name: string }[];
};
export function mediaStatus(status?: number, requestStatus?: number) {
  if (status === 6) return "blocked in Seerr";
  if (status === 7) return "removed from library";
  if (status === 5) return "available";
  if (status === 4) return "partially available";
  if (requestStatus === 3) return "not accepted by service";
  if (requestStatus === 4) return "failed";
  if (requestStatus === 5) return "completed at service";
  if (status === 3 || requestStatus === 2) return "processing";
  return "requested";
}
export async function recentlyAdded() {
  const c = await connection("jellyfin");
  const data = await upstream<
    { Id: string; Name: string; Type: string; DateCreated?: string }[]
  >(
    `${c.url!.replace(/\/$/, "")}/Items/Latest?Limit=12&IncludeItemTypes=Movie,Series&GroupItems=true${c.userId ? `&UserId=${encodeURIComponent(c.userId)}` : ""}`,
    { headers: { "X-Emby-Token": c.key } },
  );
  return data.map((m) => ({
    id: m.Id,
    title: m.Name,
    type: m.Type,
    url: `${(c.publicUrl || c.url)!.replace(/\/$/, "")}/web/#/details?id=${encodeURIComponent(m.Id)}`,
  }));
}
