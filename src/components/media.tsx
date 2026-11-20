"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FilmSlate, MagnifyingGlass } from "@phosphor-icons/react";
import { api, useHub } from "./context";
import { Empty, Field, PageTitle } from "./common";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { LibraryBrowser } from "./library";
import { WatchTogether } from "./watch";

type Result = {
  id: number;
  title: string;
  overview?: string;
  type: "movie" | "tv";
  status?: number;
};
export function Media() {
  const [tab, setTab] = useState("library");
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    if (t && ["library", "requests", "watch"].includes(t)) setTab(t);
  }, []);
  return (
    <>
      <PageTitle title="Media" />
      <div
        className="mb-8 flex flex-wrap gap-2"
        role="group"
        aria-label="Media view"
      >
        {[
          { id: "library", label: "Jellyfin" },
          { id: "requests", label: "Requests" },
          { id: "watch", label: "Watch together" },
        ].map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? "secondary" : "ghost"}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {tab === "library" ? (
        <LibraryBrowser />
      ) : tab === "watch" ? (
        <WatchTogether />
      ) : (
        <MediaRequests />
      )}
    </>
  );
}
function MediaRequests() {
  const { snapshot, pending, run } = useHub();
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Result[]>([]),
    [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Result | null>(null),
    [seasons, setSeasons] = useState<{ number: number; name: string }[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(0);
  return (
    <>
      {!snapshot.integrations.includes("seerr") ? (
        <section className="panel mb-8">
          <FilmSlate size={32} className="text-primary" />
          <Empty>
            Seerr is not connected.
            {snapshot.isOwner ? (
              <>
                {" "}
                <Link href="/settings" className="text-primary underline">
                  Connect Seerr in Settings.
                </Link>
              </>
            ) : (
              " Ask the person who set up the hub to connect it."
            )}
          </Empty>
        </section>
      ) : (
        <section className="panel mb-8">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const found = await api<Result[]>(
                  `/api/media?q=${encodeURIComponent(query)}`,
                );
                setResults(found);
                setSearched(true);
                setSelected(null);
              });
            }}
          >
            <Field label="Search movies and TV" className="min-w-0 flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                minLength={2}
                maxLength={200}
                required
                placeholder="Title"
              />
            </Field>
            <Button type="submit" disabled={pending}>
              <MagnifyingGlass />
              {pending ? "Searching…" : "Search"}
            </Button>
          </form>
          {searched && results.length === 0 && (
            <Empty>No titles found. Try another search.</Empty>
          )}
          {results.length > 0 && (
            <div className="mt-6">
              {results.map((r) => (
                <article
                  className="row flex-wrap items-start"
                  key={`${r.type}:${r.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words font-medium">{r.title}</h2>
                    <p className="subtle mt-1">
                      {r.type === "movie" ? "Movie" : "TV series"}
                      {r.status === 5
                        ? " · Available"
                        : r.status === 4
                          ? " · Partially available"
                          : ""}
                    </p>
                    {r.overview && <p className="subtle mt-3">{r.overview}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending || r.status === 5}
                    onClick={() =>
                      void run(
                        async () => {
                          if (r.type === "movie") {
                            await api("/api/media", {
                              tmdbId: r.id,
                              mediaType: "movie",
                            });
                            return;
                          }
                          const detail = await api<{
                            seasons: { number: number; name: string }[];
                          }>(`/api/media?id=${r.id}&type=tv`);
                          setSelected(r);
                          setSeasons(detail.seasons);
                          setSelectedSeason(detail.seasons[0]?.number || 0);
                        },
                        r.type === "movie" ? "Request sent." : undefined,
                      )
                    }
                  >
                    {r.status === 5
                      ? "Available"
                      : r.type === "movie"
                        ? "Request movie"
                        : "Choose season"}
                  </Button>
                </article>
              ))}
            </div>
          )}
          {selected && (
            <div className="mt-6 rounded-lg bg-secondary p-4">
              <h2 className="mb-4 break-words font-medium">{selected.title}</h2>
              {seasons.length ? (
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Season" className="min-w-0 flex-1">
                    <select
                      value={selectedSeason}
                      onChange={(e) =>
                        setSelectedSeason(Number(e.target.value))
                      }
                    >
                      {seasons.map((s) => (
                        <option value={s.number} key={s.number}>
                          {s.name || `Season ${s.number}`}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Button
                    disabled={pending}
                    onClick={() =>
                      void run(async () => {
                        await api("/api/media", {
                          tmdbId: selected.id,
                          mediaType: "tv",
                          season: selectedSeason,
                        });
                        setSelected(null);
                      }, "Request sent.")
                    }
                  >
                    Request season
                  </Button>
                  <Button variant="ghost" onClick={() => setSelected(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Empty>No seasons are available to request.</Empty>
              )}
            </div>
          )}
        </section>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="panel">
          <h2 className="mb-6 text-xl font-semibold">Requests</h2>
          {snapshot.requests.length === 0 ? (
            <Empty>No media requests.</Empty>
          ) : (
            snapshot.requests.map((r) => (
              <div key={r.id} id={r.id} className="row flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">
                    {r.title}
                    {r.season ? ` · Season ${r.season}` : ""}
                  </p>
                  <p className="subtle mt-1">
                    {snapshot.people.find((p) => p.id === r.userId)?.name ||
                      "Family member"}
                  </p>
                  {r.error && <p className="subtle mt-2">{r.error}</p>}
                </div>
                <span className="tag">{r.status}</span>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <h2 className="mb-6 text-xl font-semibold">Recently added</h2>
          <RecentMedia />
        </section>
      </div>
    </>
  );
}
export function RecentMedia() {
  const { snapshot } = useHub();
  const [items, setItems] = useState<
      { id: string; title: string; type: string; url: string }[]
    >([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const configured = snapshot.integrations.includes("jellyfin");
  useEffect(() => {
    if (!configured) return;
    let active = true;
    setLoading(true);
    api<typeof items>("/api/media?recent=1")
      .then((v) => {
        if (active) {
          setItems(v);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [configured, snapshot.jellyfinProfileId]);
  if (!configured)
    return (
      <Empty>
        Jellyfin is not connected.
        {snapshot.isOwner && (
          <>
            {" "}
            <Link href="/settings" className="text-primary underline">
              Connect Jellyfin.
            </Link>
          </>
        )}
      </Empty>
    );
  if (loading)
    return (
      <div
        aria-busy="true"
        aria-label="Loading recently added media"
        className="grid gap-3"
      >
        <div className="skeleton h-12" />
        <div className="skeleton h-12" />
        <div className="skeleton h-12" />
      </div>
    );
  if (error)
    return (
      <div role="status">
        <p className="subtle">{error}</p>
        <Button
          className="mt-4"
          size="sm"
          variant="secondary"
          onClick={async () => {
            setLoading(true);
            try {
              setItems(await api("/api/media?recent=1"));
              setError("");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          Try again
        </Button>
      </div>
    );
  return items.length ? (
    <div className="grid gap-x-6 sm:grid-cols-2">
      {items.map((m) => (
        <a
          key={m.id}
          href={m.url}
          target="_blank"
          rel="noreferrer"
          className="row justify-start rounded-md hover:bg-secondary"
        >
          <FilmSlate size={24} className="shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{m.title}</p>
            <p className="subtle mt-1">
              {m.type === "Movie" ? "Movie" : "TV series"} · Open in Jellyfin
            </p>
          </div>
        </a>
      ))}
    </div>
  ) : (
    <Empty>No recently added media.</Empty>
  );
}
