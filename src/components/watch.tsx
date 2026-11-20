"use client";
import { useState } from "react";
import Link from "next/link";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { TIME_ZONE, pacificDate } from "@/lib/calendar";
import type { HubRecord } from "@/lib/models";
import { records, api, useHub } from "./context";
import { DeleteRecord, Empty, Field, Submit, ToggleForm } from "./common";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { LibraryBrowser } from "./library";
export function WatchTogether() {
  const { snapshot, run } = useHub();
  const rooms = records(snapshot, "watchSession");
  return (
    <>
      <ToggleForm label="Start watch vote">
        {(close) => (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await api("/api/watch", {
                  action: "create",
                  title: f.get("title"),
                  closesAt: fromZonedTime(
                    String(f.get("closesAt")),
                    TIME_ZONE,
                  ).toISOString(),
                });
                close();
              });
            }}
          >
            <Field label="Movie night name">
              <Input
                name="title"
                required
                maxLength={200}
                placeholder="Friday movie night"
              />
            </Field>
            <Field label="Voting closes (Pacific)">
              <Input
                type="datetime-local"
                name="closesAt"
                required
                defaultValue={formatInTimeZone(
                  new Date(Date.now() + 86400000),
                  TIME_ZONE,
                  "yyyy-MM-dd'T'HH:mm",
                )}
              />
            </Field>
            <div>
              <Submit>Start watch vote</Submit>
            </div>
          </form>
        )}
      </ToggleForm>
      {!rooms.length ? (
        <section className="panel">
          <Empty>
            No watch votes. Start a vote to nominate movies or episodes from
            Jellyfin.
          </Empty>
        </section>
      ) : (
        <div className="grid gap-6">
          {[...rooms].reverse().map((room) => (
            <WatchRoom key={room.id} room={room} />
          ))}
        </div>
      )}
    </>
  );
}
function WatchRoom({ room }: { room: HubRecord<"watchSession"> }) {
  const { snapshot, pending, run } = useHub();
  const [nominating, setNominating] = useState(false),
    [scheduling, setScheduling] = useState(false);
  const data = room.data;
  const calendar = records(snapshot, "event").find(
    (event) => event.id === data.eventId,
  );
  const scheduledTime = calendar
    ? formatInTimeZone(
        fromZonedTime(
          `${calendar.data.date}T${calendar.data.allDay ? "09:00" : calendar.data.time}:00`,
          TIME_ZONE,
        ),
        TIME_ZONE,
        calendar.data.allDay ? "MMM d, yyyy '· All day'" : "MMM d, h:mm a zzz",
      )
    : null;
  const closed = new Date(data.closesAt) <= new Date(),
    isCreator = room.createdBy === snapshot.user.id;
  const count = (id: string) =>
    Object.values(data.votes).filter((v) => v === id).length;
  const top = Math.max(0, ...data.nominations.map((n) => count(n.itemId)));
  const leaders = data.nominations.filter((n) => count(n.itemId) === top);
  const action = (name: string, extra: object = {}) =>
    run(() =>
      api("/api/watch", {
        action: name,
        id: room.id,
        revision: room.revision,
        ...extra,
      }),
    );
  return (
    <section className="panel" id={room.id}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="break-words text-2xl font-semibold">{data.title}</h2>
          <p className="subtle mt-2">
            {data.eventId
              ? scheduledTime
                ? `Scheduled · ${scheduledTime}`
                : "Calendar event removed"
              : `${closed ? "Voting closed" : "Voting open"} · ${formatInTimeZone(new Date(data.closesAt), TIME_ZONE, "MMM d, h:mm a zzz")}`}
          </p>
        </div>
        {isCreator && <DeleteRecord record={room} />}
      </div>
      {data.eventId ? (
        <div>
          <p className="mb-4 font-medium">
            {data.nominations.find((n) => n.itemId === data.selectedId)?.title}
          </p>
          <div className="flex flex-wrap gap-4">
            {calendar && (
              <Link
                className="text-sm text-primary underline"
                href={`/calendar?event=${data.eventId}`}
              >
                Open calendar event
              </Link>
            )}
            <a
              className="text-sm text-primary underline"
              href={`/media?item=${encodeURIComponent(data.selectedId || "")}`}
            >
              Open title
            </a>
          </div>
        </div>
      ) : (
        <>
          {data.nominations.length === 0 && (
            <Empty>No titles nominated yet.</Empty>
          )}
          {data.nominations.map((n) => (
            <div className="row flex-wrap" key={n.itemId}>
              <div className="min-w-0 flex-1">
                <a
                  className="break-words font-medium hover:underline"
                  href={`/media?item=${encodeURIComponent(n.itemId)}`}
                >
                  {n.title}
                </a>
                <p className="subtle mt-1">
                  {n.type === "Movie" ? "Movie" : "Episode"} · {count(n.itemId)}{" "}
                  {count(n.itemId) === 1 ? "vote" : "votes"}
                </p>
                <p className="subtle mt-1">
                  Nominated by{" "}
                  {snapshot.people.find((p) => p.id === n.proposedBy)?.name ||
                    "Former member"}
                </p>
              </div>
              <Button
                size="sm"
                variant={
                  data.votes[snapshot.user.id] === n.itemId
                    ? "secondary"
                    : "outline"
                }
                aria-pressed={data.votes[snapshot.user.id] === n.itemId}
                disabled={pending || closed}
                onClick={() => void action("vote", { itemId: n.itemId })}
              >
                {data.votes[snapshot.user.id] === n.itemId
                  ? "Your vote"
                  : "Vote"}
              </Button>
            </div>
          ))}
          <div className="mt-6 flex flex-wrap gap-3">
            {!closed && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setNominating((v) => !v)}
              >
                {nominating ? "Close library" : "Nominate from Jellyfin"}
              </Button>
            )}
            {!closed && data.votes[snapshot.user.id] && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void action("withdraw")}
              >
                Withdraw vote
              </Button>
            )}
            {isCreator && data.nominations.length > 0 && (
              <Button size="sm" onClick={() => setScheduling((v) => !v)}>
                {scheduling ? "Close scheduling" : "Schedule movie night"}
              </Button>
            )}
          </div>
          {nominating && !closed && (
            <div className="mt-6">
              <LibraryBrowser
                onChoose={(item) =>
                  void run(async () => {
                    await api("/api/watch", {
                      action: "nominate",
                      id: room.id,
                      revision: room.revision,
                      itemId: item.id,
                    });
                    setNominating(false);
                  }, "Title nominated.")
                }
              />
            </div>
          )}
          {scheduling && isCreator && (
            <form
              className="mt-6 grid gap-4 rounded-lg bg-secondary p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  await api("/api/watch", {
                    action: "schedule",
                    id: room.id,
                    revision: room.revision,
                    itemId: f.get("itemId"),
                    date: f.get("date"),
                    time: f.get("time"),
                    location: f.get("location"),
                  });
                  setScheduling(false);
                  setNominating(false);
                }, "Movie night added to Calendar.");
              }}
            >
              <Field label="Winning title">
                <select name="itemId">
                  {leaders.map((n) => (
                    <option key={n.itemId} value={n.itemId}>
                      {n.title} ({count(n.itemId)} votes)
                    </option>
                  ))}
                </select>
              </Field>
              <p className="subtle">
                Scheduling ends this vote. If titles are tied, choose any tied
                title.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Movie night date">
                  <Input
                    name="date"
                    type="date"
                    min={pacificDate()}
                    defaultValue={pacificDate(new Date(Date.now() + 86400000))}
                    required
                  />
                </Field>
                <Field label="Start time (Pacific)">
                  <Input
                    name="time"
                    type="time"
                    defaultValue="19:00"
                    required
                  />
                </Field>
              </div>
              <Field label="Location">
                <Input
                  name="location"
                  maxLength={500}
                  placeholder="Living room"
                />
              </Field>
              <div>
                <Submit>Add movie night to Calendar</Submit>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
