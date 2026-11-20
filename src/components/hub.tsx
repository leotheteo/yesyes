"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  House,
  ForkKnife,
  FilmSlate,
  Basket,
  CalendarBlank,
  GearSix,
  Bell,
  SignOut,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import type { HubRecord, Snapshot } from "@/lib/models";
import { TIME_ZONE } from "@/lib/calendar";
import { api, HubContext } from "./context";
import { Button } from "./ui/button";
import { SignIn } from "./sign-in";
import { Undo } from "./common";
import { Shopping } from "./shopping";
import { Food } from "./food";
import { Calendar } from "./calendar";
import { Media } from "./media";
import { Settings } from "./settings";
import { Home } from "./home";

const nav = [
  { title: "Home", href: "/", icon: House },
  { title: "Food", href: "/food", icon: ForkKnife },
  { title: "Media", href: "/media", icon: FilmSlate },
  { title: "Shopping", href: "/shopping", icon: Basket },
  { title: "Calendar", href: "/calendar", icon: CalendarBlank },
];
export function Hub({ section = "home" }: { section?: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true),
    [signedOut, setSignedOut] = useState(false);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(true);
  const revision = useRef(-1),
    inFlight = useRef(false),
    sequence = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++sequence.current;
    const response = await fetch("/api/snapshot", { cache: "no-store" });
    if (response.status === 401) {
      setSignedOut(true);
      setSnapshot(null);
      setLoading(false);
      return;
    }
    const value = await response.json();
    if (!response.ok)
      throw new Error(value.error || "Could not load the hub. Try again.");
    if (seq === sequence.current) {
      setSnapshot(value);
      revision.current = value.revision;
      setSignedOut(false);
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, [refresh]);
  const signedIn = !!snapshot;
  useEffect(() => {
    if (!signedIn) return;
    const stream = new EventSource("/api/stream");
    stream.onopen = () => {
      setConnected(true);
      void refresh().catch((e) => setError(e.message));
    };
    stream.onmessage = (e) => {
      const message = JSON.parse(e.data);
      if (message.revision !== revision.current && !inFlight.current)
        void refresh().catch((e) => setError(e.message));
    };
    stream.onerror = () => {
      setConnected(false);
      void refresh().catch(() => {});
    };
    const focus = () => {
      void refresh().catch((e) => setError(e.message));
    };
    window.addEventListener("focus", focus);
    return () => {
      stream.close();
      window.removeEventListener("focus", focus);
    };
  }, [signedIn, refresh]);
  const run = useCallback(
    async (action: () => Promise<unknown>, success?: string) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setPending(true);
      setError("");
      setNotice("");
      try {
        await action();
        await refresh();
        if (success) setNotice(success);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Try again.");
        await refresh().catch(() => {});
        return false;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [refresh],
  );
  if (signedOut)
    return (
      <SignIn
        onSignedIn={() => {
          void refresh().catch((e) => setError(e.message));
        }}
      />
    );
  if (loading)
    return (
      <main
        className="mx-auto max-w-7xl space-y-8 px-6 py-16"
        aria-busy="true"
        aria-label="Loading family hub"
      >
        <div className="skeleton h-12" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="skeleton h-64" />
          <div className="skeleton h-64" />
        </div>
      </main>
    );
  if (!snapshot)
    return (
      <main className="mx-auto max-w-lg px-6 py-24">
        <h1 className="text-3xl font-semibold">Could not load the hub</h1>
        <p role="alert" className="my-6">
          {error}
        </p>
        <Button
          onClick={() => {
            setLoading(true);
            void refresh().catch((e) => {
              setError(e.message);
              setLoading(false);
            });
          }}
        >
          Try again
        </Button>
      </main>
    );
  const unread = snapshot.notifications.filter((n) => !n.read).length;
  return (
    <HubContext.Provider
      value={{
        snapshot,
        pending,
        run,
        refresh,
        mutate: (command) => api<HubRecord>("/api/records", command),
        setNotice,
      }}
    >
      <a
        className="fixed left-4 top-4 z-50 -translate-y-32 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:translate-y-0"
        href="#content"
      >
        Skip to content
      </a>
      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 py-6 sm:py-8">
          <Link href="/" className="flex items-center gap-3 rounded-md">
            <img src="/icon.svg" width="40" height="40" alt="" />
            <span className="text-xl font-semibold tracking-tight">
              {snapshot.household}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="subtle mr-2 hidden sm:block">
              {snapshot.user.name}
            </span>
            <Link
              className="relative rounded-md p-3 hover:bg-secondary"
              href="/notifications"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            >
              <Bell size={20} />
              {unread > 0 && (
                <span className="absolute right-0 top-0 rounded bg-primary px-1 text-xs text-primary-foreground">
                  {unread}
                </span>
              )}
            </Link>
            <Link
              href="/settings"
              className="rounded-md p-3 hover:bg-secondary"
              aria-label="Settings"
            >
              <GearSix size={20} />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  await api("/api/auth/sign-out", {});
                }, undefined)
              }
            >
              <SignOut size={20} />
            </Button>
          </div>
        </header>
        <nav
          aria-label="Main navigation"
          className="mb-8 grid grid-cols-5 gap-0 rounded-xl bg-secondary p-2 sm:mb-12 sm:flex sm:w-max sm:gap-2"
        >
          {nav.map((n) => {
            const active =
              section === (n.href === "/" ? "home" : n.href.slice(1));
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-label={n.title}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-0 flex-col items-center justify-center gap-2 rounded-md px-2 py-2 text-xs font-medium transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] sm:flex-row sm:px-4 sm:text-sm ${active ? "bg-background text-primary" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}
              >
                <Icon size={20} weight={active ? "fill" : "regular"} />
                {n.title === "Shopping" ? (
                  <>
                    <span className="sm:hidden">Lists</span>
                    <span className="hidden sm:inline">Shopping</span>
                  </>
                ) : (
                  n.title
                )}
              </Link>
            );
          })}
        </nav>
        {!connected && (
          <p
            role="status"
            className="mb-6 flex items-center gap-3 rounded-md border border-border p-4 text-sm"
          >
            <WifiSlash size={20} />
            Live updates disconnected. Reconnecting…{" "}
            <Button
              size="sm"
              variant="link"
              onClick={() => void refresh().catch((e) => setError(e.message))}
            >
              Refresh
            </Button>
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mb-6 flex items-start justify-between gap-4 rounded-md border border-primary p-4"
          >
            <p>{error}</p>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X />
            </Button>
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-6 flex flex-wrap items-center gap-3 rounded-md bg-secondary p-4 text-sm"
          >
            <span>{notice}</span>
            <Undo />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
            >
              <X />
            </Button>
          </div>
        )}
        <main id="content" tabIndex={-1} aria-busy={pending}>
          {section === "home" ? (
            <Home />
          ) : section === "shopping" ? (
            <Shopping />
          ) : section === "food" ? (
            <Food />
          ) : section === "calendar" ? (
            <Calendar />
          ) : section === "media" ? (
            <Media />
          ) : section === "settings" ? (
            <Settings />
          ) : (
            <>
              <h1 className="mb-8 text-3xl font-semibold">Notifications</h1>
              {unread > 0 && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => void run(() => api("/api/notifications", {}))}
                >
                  Mark all read
                </Button>
              )}
              {snapshot.notifications.length === 0 ? (
                <p className="empty">No reminders yet.</p>
              ) : (
                snapshot.notifications.map((n) => (
                  <div className="row" key={n.id}>
                    <Link
                      href={`/calendar?event=${n.eventId}`}
                      className={`min-w-0 break-words ${n.read ? "text-muted-foreground" : "font-medium"}`}
                    >
                      {n.title}
                    </Link>
                    {!n.read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          void run(() =>
                            api("/api/notifications", { id: n.id }),
                          )
                        }
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </main>
        <footer className="subtle mt-16 flex flex-wrap justify-between gap-4 border-t border-border pt-6">
          <span>
            Pacific time ·{" "}
            {new Intl.DateTimeFormat("en-US", {
              timeZone: TIME_ZONE,
              timeZoneName: "short",
            }).format(new Date())}
          </span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
          </div>
        </footer>
      </div>
    </HubContext.Provider>
  );
}
