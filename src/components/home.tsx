"use client";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { addDays, format } from "date-fns";
import { CalendarBlank, Basket, ForkKnife, Plus } from "@phosphor-icons/react";
import { occurrences, pacificDate, TIME_ZONE } from "@/lib/calendar";
import { records, useHub } from "./context";
import { Empty, PageTitle } from "./common";
import { RecentMedia } from "./media";
export function Home() {
  const { snapshot, pending, run, mutate } = useHub();
  const today = pacificDate();
  const through = format(
    addDays(new Date(`${today}T12:00:00`), 30),
    "yyyy-MM-dd",
  );
  const upcoming = records(snapshot, "event")
    .flatMap((r) => occurrences(r.id, r.data, today, through))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 5);
  const items = records(snapshot, "item").filter((i) => !i.data.checked);
  const polls = records(snapshot, "voteSession").filter(
    (p) => !p.data.finalized,
  );
  const restaurants = records(snapshot, "restaurant");
  return (
    <>
      <PageTitle
        title={formatInTimeZone(new Date(), TIME_ZONE, "EEEE, MMMM d")}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="panel">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="flex items-center gap-3 text-xl font-semibold">
              <CalendarBlank className="text-primary" size={24} />
              Coming up
            </h2>
            <Link
              href="/calendar"
              className="text-sm text-primary hover:underline"
            >
              Calendar
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <>
              <Empty>No events in the next 30 days.</Empty>
              <Link
                href="/calendar"
                className="inline-flex items-center gap-2 text-sm text-primary"
              >
                <Plus size={16} />
                Create event
              </Link>
            </>
          ) : (
            upcoming.map((e) => (
              <Link
                className="row rounded-md hover:bg-secondary"
                key={`${e.eventId}:${e.date}`}
                href={`/calendar?event=${e.eventId}`}
              >
                <div className="w-12 shrink-0 text-center">
                  <div className="meta-label">
                    {formatInTimeZone(new Date(e.start), TIME_ZONE, "MMM")}
                  </div>
                  <div className="text-3xl font-medium tabular-nums">
                    {Number(e.date.slice(-2))}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{e.title}</p>
                  <p className="subtle mt-1 break-words">
                    {e.allDay
                      ? "All day"
                      : formatInTimeZone(
                          new Date(e.start),
                          TIME_ZONE,
                          "h:mm a",
                        )}
                    {e.location ? ` · ${e.location}` : ""}
                  </p>
                </div>
                <span className="tag hidden sm:inline-flex">{e.category}</span>
              </Link>
            ))
          )}
        </section>
        <div className="grid gap-6">
          <section className="panel">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-3 text-xl font-semibold">
                <ForkKnife className="text-primary" size={24} />
                Food votes
              </h2>
              <Link
                href="/food"
                className="text-sm text-primary hover:underline"
              >
                Food
              </Link>
            </div>
            {polls.length === 0 ? (
              <Empty>No active food votes.</Empty>
            ) : (
              polls.slice(0, 3).map((p) => (
                <Link
                  href="/food"
                  className="row rounded-md hover:bg-secondary"
                  key={p.id}
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{p.data.title}</p>
                    <p className="subtle mt-1">
                      {p.data.selectedId
                        ? restaurants.find((r) => r.id === p.data.selectedId)
                            ?.data.name || "Restaurant removed"
                        : `${p.data.participants.length} participants`}
                    </p>
                  </div>
                  <span className="tag">
                    {new Date(p.data.closesAt) > new Date() ? "Open" : "Closed"}
                  </span>
                </Link>
              ))
            )}
          </section>
          <section className="panel">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-3 text-xl font-semibold">
                <Basket className="text-primary" size={24} />
                To pick up
              </h2>
              <Link
                href="/shopping"
                className="text-sm text-primary hover:underline"
              >
                {items.length} items
              </Link>
            </div>
            {items.length === 0 ? (
              <Empty>No items left to pick up.</Empty>
            ) : (
              items.slice(0, 5).map((i) => (
                <div className="row" key={i.id}>
                  <label className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={false}
                      disabled={pending}
                      onChange={() =>
                        void run(() =>
                          mutate({
                            action: "update",
                            kind: "item",
                            id: i.id,
                            revision: i.revision,
                            data: { ...i.data, checked: true },
                          }),
                        )
                      }
                    />
                    <span className="min-w-0 break-words">{i.data.name}</span>
                  </label>
                  <span className="subtle shrink-0 tabular-nums">
                    {i.data.quantity} {i.data.unit}
                  </span>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
      <section className="panel mt-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Recently added</h2>
          <Link href="/media" className="text-sm text-primary hover:underline">
            Media
          </Link>
        </div>
        <RecentMedia />
      </section>
    </>
  );
}
