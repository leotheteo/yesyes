"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FilmSlate, Heart, Check } from "@phosphor-icons/react";
import type { LibraryItem } from "@/lib/jellyfin";
import { api, useHub } from "./context";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Empty, Field } from "./common";
type Listing = { items: LibraryItem[]; total: number; personal: boolean };
export function LibraryBrowser({
  onChoose,
}: {
  onChoose?: (item: LibraryItem) => void;
}) {
  const { snapshot, pending, run } = useHub();
  const [view, setView] = useState("library"),
    [type, setType] = useState("all"),
    [filter, setFilter] = useState("all");
  const [library, setLibrary] = useState(""),
    [series, setSeries] = useState(""),
    [libraries, setLibraries] = useState<{ id: string; title: string }[]>([]);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0);
  const [listing, setListing] = useState<Listing | null>(null),
    [selected, setSelected] = useState<LibraryItem | null>(null),
    [personal, setPersonal] = useState(false);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const configured = snapshot.integrations.includes("jellyfin");
  useEffect(() => {
    if (!configured) return;
    let active = true;
    api<{ items: { id: string; title: string }[] }>(
      "/api/jellyfin?view=libraries",
    )
      .then((v) => {
        if (active) setLibraries(v.items);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [configured, snapshot.jellyfinProfileId]);
  useEffect(() => {
    if (!configured) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      view,
      type,
      filter,
      page: String(page),
      q: search,
    });
    if (view === "episodes") params.set("parent", series);
    else if (library) params.set("parent", library);
    fetch(`/api/jellyfin?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok)
          throw new Error(data.error || "Could not load Jellyfin. Try again.");
        if (!controller.signal.aborted) {
          setListing(data);
          setPersonal(data.personal);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    configured,
    view,
    type,
    filter,
    page,
    search,
    library,
    series,
    reload,
    snapshot.jellyfinProfileId,
  ]);
  useEffect(() => {
    if (!configured || onChoose) return;
    const id = new URLSearchParams(window.location.search).get("item");
    if (id) void open(id);
  }, [configured]);
  async function open(id: string) {
    setError("");
    try {
      const data = await api<{ item: LibraryItem; personal: boolean }>(
        `/api/jellyfin?view=detail&id=${encodeURIComponent(id)}`,
      );
      setSelected(data.item);
      setPersonal(data.personal);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function toggle(action: "favorite" | "played", item: LibraryItem) {
    await run(async () => {
      await api("/api/jellyfin", {
        action,
        itemId: item.id,
        value: action === "favorite" ? !item.favorite : !item.played,
      });
      const result = await api<{ item: LibraryItem }>(
        `/api/jellyfin?view=detail&id=${encodeURIComponent(item.id)}`,
      );
      setSelected(result.item);
      setReload((v) => v + 1);
    });
  }
  if (!configured)
    return (
      <section className="panel">
        <Empty>
          Jellyfin is not connected.{" "}
          {snapshot.isOwner ? (
            <Link className="text-primary underline" href="/settings">
              Connect Jellyfin in Settings.
            </Link>
          ) : (
            "Ask the person who set up the hub to connect it."
          )}
        </Empty>
      </section>
    );
  return (
    <div>
      <div
        className="mb-6 flex flex-wrap gap-2"
        role="group"
        aria-label="Jellyfin view"
      >
        {[
          { value: "library", label: "Library" },
          { value: "resume", label: "Continue watching" },
          { value: "next", label: "Next episodes" },
        ].map((v) => (
          <Button
            key={v.value}
            size="sm"
            variant={view === v.value ? "secondary" : "ghost"}
            aria-pressed={view === v.value}
            onClick={() => {
              setView(v.value);
              setPage(1);
              setSelected(null);
            }}
          >
            {v.label}
          </Button>
        ))}
      </div>
      {view === "library" && (
        <section className="panel mb-6">
          <form
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query.trim());
              setPage(1);
              setReload((v) => v + 1);
            }}
          >
            <Field label="Search Jellyfin">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={200}
                placeholder="Title"
              />
            </Field>
            <Field label="Library">
              <select
                value={library}
                onChange={(e) => {
                  setLibrary(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All libraries</option>
                {libraries.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Media type">
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Movies and series</option>
                <option value="Movie">Movies</option>
                <option value="Series">TV series</option>
              </select>
            </Field>
            <Field label="Filter">
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All titles</option>
                <option value="favorites">My favorites</option>
                <option value="unwatched">My unwatched titles</option>
              </select>
            </Field>
            <div className="flex flex-wrap gap-3 sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={loading}>
                Search library
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={loading}
                onClick={() => setReload((v) => v + 1)}
              >
                Refresh
              </Button>
            </div>
          </form>
        </section>
      )}
      {view === "episodes" && (
        <div className="mb-6">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setView("library");
              setPage(1);
            }}
          >
            Back to library
          </Button>
          <h2 className="mt-4 text-xl font-semibold">Episodes</h2>
        </div>
      )}
      {error && (
        <div role="alert" className="panel mb-6">
          <p>{error}</p>
          <div className="mt-4 flex gap-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setReload((v) => v + 1)}
            >
              Try again
            </Button>
            <Link href="/settings" className="text-sm text-primary underline">
              Settings
            </Link>
          </div>
        </div>
      )}
      {selected && (
        <section className="panel mb-6" aria-label="Jellyfin title details">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-semibold">
                {selected.title}
              </h2>
              <p className="subtle mt-2">
                {[
                  selected.series,
                  selected.year,
                  selected.minutes ? `${selected.minutes} min` : "",
                  selected.contentRating,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Close details
            </Button>
          </div>
          {selected.overview && (
            <p className="mt-4 text-sm">{selected.overview}</p>
          )}
          {selected.genres.length > 0 && (
            <p className="subtle mt-4">{selected.genres.join(", ")}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href={selected.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold hover:bg-muted"
            >
              Open in Jellyfin
            </a>
            {selected.type === "Series" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSeries(selected.id);
                  setView("episodes");
                  setPage(1);
                  setSelected(null);
                }}
              >
                Browse episodes
              </Button>
            ) : (
              onChoose && (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => onChoose(selected)}
                >
                  Nominate title
                </Button>
              )
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !personal}
              aria-pressed={selected.favorite}
              onClick={() => void toggle("favorite", selected)}
            >
              <Heart weight={selected.favorite ? "fill" : "regular"} />
              {selected.favorite ? "Remove favorite" : "Add favorite"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !personal}
              onClick={() => void toggle("played", selected)}
            >
              <Check />
              {selected.played ? "Mark unwatched" : "Mark watched"}
            </Button>
          </div>
          {!personal && (
            <p className="subtle mt-4">
              Link your Jellyfin profile in Settings to change favorites or
              watch history.
            </p>
          )}
        </section>
      )}
      {loading ? (
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          aria-busy="true"
          aria-label="Loading Jellyfin titles"
        >
          {[1, 2, 3, 4].map((i) => (
            <div className="skeleton h-64" key={i} />
          ))}
        </div>
      ) : !error && listing && listing.items.length === 0 ? (
        <section className="panel">
          <Empty>No titles found.</Empty>
        </section>
      ) : (
        !error &&
        listing && (
          <>
            <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {listing.items.map((item) => (
                <article
                  key={item.id}
                  className="min-w-0 rounded-lg bg-secondary p-3"
                >
                  <button
                    className="w-full min-w-0 rounded-md text-left focus-visible:outline-2 focus-visible:outline-primary"
                    aria-label={`Open ${item.title}`}
                    onClick={() => void open(item.id)}
                  >
                    <Poster image={item.image} />
                    <h3 className="mt-3 break-words text-base font-medium">
                      {item.title}
                    </h3>
                    <p className="subtle mt-1">
                      {item.type}
                      {item.year ? ` · ${item.year}` : ""}
                    </p>
                    {item.series && (
                      <p className="subtle mt-1 break-words">
                        {item.series} · S{item.season} E{item.episode}
                      </p>
                    )}
                  </button>
                  {item.progress > 0 && (
                    <div className="mt-3">
                      <progress
                        value={item.progress}
                        max={100}
                        className="w-full accent-primary"
                        aria-label={`${Math.round(item.progress)}% watched`}
                      />
                      <p className="subtle">
                        {Math.round(item.progress)}% watched
                      </p>
                    </div>
                  )}
                  {onChoose && item.type !== "Series" && (
                    <Button
                      className="mt-3 w-full"
                      size="sm"
                      disabled={pending}
                      onClick={() => onChoose(item)}
                    >
                      Nominate
                    </Button>
                  )}
                </article>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <p className="subtle">
                Page {page} · {listing.total} titles
              </p>
              <Button
                variant="secondary"
                size="sm"
                disabled={page * 24 >= listing.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}
function Poster({ image }: { image: string | null }) {
  const [failed, setFailed] = useState(false);
  return image && !failed ? (
    <img
      src={image}
      loading="lazy"
      alt=""
      className="aspect-[2/3] w-full rounded-md object-cover"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="flex aspect-[2/3] items-center justify-center rounded-md bg-background">
      <FilmSlate size={40} className="text-muted-foreground" />
    </div>
  );
}
