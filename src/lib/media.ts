import { Prisma } from "@prisma/client";
import { db } from "./db";
import { assert } from "./errors";
import {
  connection,
  mediaStatus,
  seerr,
  type SeerrMedia,
} from "./integrations";

type RemoteRequest = {
  id: number;
  status: number;
  seasons?: { seasonNumber: number }[];
};
type Detail = Omit<SeerrMedia, "mediaInfo"> & {
  mediaInfo?: {
    status: number;
    requests?: RemoteRequest[];
    seasons?: { seasonNumber: number; status: number }[];
  };
};
async function updateRequest(id: string, data: Prisma.MediaRequestUpdateInput) {
  return db.$transaction(async (tx) => {
    await tx.household.update({
      where: { id: "family" },
      data: { revision: { increment: 1 } },
    });
    return tx.mediaRequest.update({ where: { id }, data });
  });
}
export async function syncRequest(row: {
  id: string;
  mediaType: string;
  tmdbId: number;
  season: number;
  createdAt: Date;
  status: string;
}) {
  const detail = await seerr<Detail>(`/${row.mediaType}/${row.tmdbId}`);
  const existing = detail.mediaInfo?.requests?.find(
    (r) =>
      row.mediaType === "movie" ||
      r.seasons?.some((s) => s.seasonNumber === row.season),
  );
  const seasonStatus = detail.mediaInfo?.seasons?.find(
    (s) => s.seasonNumber === row.season,
  )?.status;
  const status =
    row.mediaType === "tv" ? seasonStatus : detail.mediaInfo?.status;
  if (existing || (status !== undefined && [4, 5, 6, 7].includes(status))) {
    const nextStatus = mediaStatus(status, existing?.status);
    await updateRequest(row.id, {
      externalId: existing?.id,
      status: nextStatus,
      error: [
        "failed",
        "not accepted by service",
        "blocked in Seerr",
        "removed from library",
      ].includes(nextStatus)
        ? "Check this title in Seerr to resolve its status. The hub will check again automatically."
        : null,
    });
    return true;
  }
  return false;
}
export async function requestMedia(
  input: { tmdbId: number; mediaType: "movie" | "tv"; season: number },
  userId: string,
) {
  const detail = await seerr<Detail>(`/${input.mediaType}/${input.tmdbId}`);
  const title = detail.title || detail.name || String(input.tmdbId);
  assert(
    detail.mediaInfo?.status !== 6,
    409,
    "This title is blocked in Seerr. Check its settings before requesting it.",
  );
  if (input.mediaType === "tv")
    assert(
      detail.seasons?.some((s) => s.seasonNumber === input.season),
      400,
      "Select an existing season.",
    );
  const key = `${input.mediaType}:${input.tmdbId}:${input.season}`;
  const previous = await db.mediaRequest.findUnique({ where: { key } });
  if (previous) {
    if (previous.status === "uncertain") {
      const found = await syncRequest(previous);
      assert(
        found,
        409,
        "The previous submission could not be confirmed. Check Seerr before retrying; the hub will keep checking.",
      );
    }
    return db.mediaRequest.findUnique({ where: { key } });
  }
  const row = await db.$transaction(async (tx) => {
    await tx.household.update({
      where: { id: "family" },
      data: { revision: { increment: 1 } },
    });
    return tx.mediaRequest.create({ data: { key, ...input, title, userId } });
  });
  try {
    if (await syncRequest(row))
      return await db.mediaRequest.findUnique({ where: { id: row.id } });
    const c = await connection("seerr");
    const result = await seerr<RemoteRequest>("/request", {
      method: "POST",
      body: JSON.stringify({
        mediaType: input.mediaType,
        mediaId: input.tmdbId,
        ...(input.mediaType === "tv" ? { seasons: [input.season] } : {}),
        ...(c.userId ? { userId: Number(c.userId) } : {}),
      }),
    });
    return await updateRequest(row.id, {
      externalId: result.id,
      status: mediaStatus(undefined, result.status),
    });
  } catch {
    // A timeout may occur after Seerr accepted the request. Never blindly resubmit.
    await updateRequest(row.id, {
      status: "uncertain",
      error:
        "Submission could not be confirmed. The server will check Seerr again.",
    });
    return db.mediaRequest.findUnique({ where: { id: row.id } });
  }
}
export async function reconcileMedia() {
  const configured = await db.integration.findUnique({
    where: { id: "seerr" },
    select: { id: true },
  });
  if (!configured) return;
  const rows = await db.mediaRequest.findMany({
    take: 100,
    orderBy: { updatedAt: "asc" },
  });
  for (const row of rows) {
    try {
      if (await syncRequest(row)) continue;
      if (
        row.status === "submitting" &&
        Date.now() - row.createdAt.getTime() > 60000
      ) {
        await updateRequest(row.id, {
          status: "uncertain",
          error:
            "Submission could not be confirmed. Check Seerr before trying again.",
        });
      } else await updateRequest(row.id, { updatedAt: new Date() });
    } catch {
      // Rotate a failing title behind the other records and stop this cycle so
      // a service outage cannot delay calendar reminders by repeated timeouts.
      await updateRequest(row.id, { updatedAt: new Date() });
      break;
    }
  }
}
