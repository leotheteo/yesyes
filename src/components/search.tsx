"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { SearchHit } from "@/lib/search";
import type { LibraryItem } from "@/lib/jellyfin";
import { useHub } from "./context";
import { Empty, Field, PageTitle } from "./common";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function Search() {
  const { snapshot } = useHub();
  const [query, setQuery] = useState(""),
    [submitted, setSubmitted] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]),
    [library, setLibrary] = useState<LibraryItem[]>([]);
  const [error, setError] = useState(""),
    [mediaError, setMediaError] = useState(""),
    [loading, setLoading] = useState(false),
    [mediaLoading, setMediaLoading] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q") || "";
    setQuery(q);
    setSubmitted(q);
  }, []);
  useEffect(() => {
    if (submitted.trim().length < 2) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setHits([]);
    setLibrary([]);
    setMediaError("");
    const read = async <T,>(path: string) => {
      const r = await fetch(path, {
        signal: controller.signal,
        cache: "no-store",
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error || "Search failed. Try again.");
      return v as T;
    };
    read<{ hits: SearchHit[] }>(
      `/api/search?q=${encodeURIComponent(submitted)}`,
    )
      .then((v) => setHits(v.hits))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    if (snapshot.integrations.includes("jellyfin")) {
      setMediaLoading(true);
      read<{ items: LibraryItem[] }>(
        `/api/jellyfin?q=${encodeURIComponent(submitted)}`,
      )
        .then((v) => setLibrary(v.items))
        .catch((e) => {
          if (!controller.signal.aborted) setMediaError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setMediaLoading(false);
        });
    }
    return () => controller.abort();
  }, [submitted, snapshot.integrations.join(",")]);
  return (
    <>
      <PageTitle title="Search" />
      <form
        className="mb-8 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const value = query.trim();
          setSubmitted(value);
          window.history.replaceState(
            null,
            "",
            `/search?q=${encodeURIComponent(value)}`,
          );
        }}
      >
        <Field label="Search the hub" className="min-w-0 flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            minLength={2}
            maxLength={200}
            autoFocus
            required
            placeholder="Events, items, restaurants, attachments, media"
          />
        </Field>
        <Button type="submit">Search</Button>
      </form>
      {!submitted ? (
        <Empty>Enter at least two characters.</Empty>
      ) : (
        <>
          <section className="panel">
            <h2 className="mb-4 text-xl font-semibold">Household</h2>
            {loading ? (
              <div
                className="skeleton h-24"
                aria-label="Searching household"
                role="status"
              />
            ) : error ? (
              <p role="alert">{error}</p>
            ) : !hits.length ? (
              <Empty>No household results.</Empty>
            ) : (
              hits.map((hit) => (
                <Link
                  key={`${hit.type}:${hit.id}`}
                  href={hit.url}
                  className="row rounded-md hover:bg-secondary"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{hit.title}</p>
                    <p className="subtle mt-1">{hit.type}</p>
                    {hit.detail && (
                      <p className="subtle mt-2 break-words">{hit.detail}</p>
                    )}
                  </div>
                </Link>
              ))
            )}
          </section>
          {snapshot.integrations.includes("jellyfin") && (
            <section className="panel mt-6">
              <h2 className="mb-4 text-xl font-semibold">Jellyfin</h2>
              {mediaLoading ? (
                <p role="status" className="subtle">
                  Searching Jellyfin…
                </p>
              ) : mediaError ? (
                <p role="status" className="subtle">
                  {mediaError}{" "}
                  <Link href="/settings" className="text-primary underline">
                    Settings
                  </Link>
                </p>
              ) : !library.length ? (
                <Empty>No Jellyfin results.</Empty>
              ) : (
                library.map((item) => (
                  <Link
                    key={item.id}
                    href={`/media?item=${encodeURIComponent(item.id)}`}
                    className="row rounded-md hover:bg-secondary"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-medium">{item.title}</p>
                      <p className="subtle">
                        {item.type}
                        {item.year ? ` · ${item.year}` : ""}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
