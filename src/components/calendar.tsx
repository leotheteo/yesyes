"use client";
import { useEffect, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
} from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Paperclip,
  DownloadSimple,
  Trash,
  X,
} from "@phosphor-icons/react";
import type { FamilyEvent, HubRecord } from "@/lib/models";
import {
  occurrences,
  pacificDate,
  TIME_ZONE,
  type Occurrence,
} from "@/lib/calendar";
import { api, records, useHub } from "./context";
import {
  DeleteRecord,
  Empty,
  Field,
  PageTitle,
  Submit,
  ToggleForm,
} from "./common";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function Calendar() {
  const { snapshot, run, mutate, pending } = useHub();
  const today = pacificDate();
  const [month, setMonth] = useState(today.slice(0, 7) + "-01"),
    [view, setView] = useState("month");
  const [day, setDay] = useState<string | null>(null),
    [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<{
    record: HubRecord<"event">;
    occurrence?: Occurrence;
  } | null>(null);
  useEffect(() => {
    if (!editing) return;
    const editor = document.getElementById("event-editor");
    editor?.focus({ preventScroll: true });
    editor?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }, [editing]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("event");
    if (id) {
      setSelected(id);
      setView("agenda");
    }
  }, []);
  const rows = records(snapshot, "event");
  const start = startOfMonth(parseISO(month)),
    end = endOfMonth(start);
  const from = format(start, "yyyy-MM-dd"),
    through = format(end, "yyyy-MM-dd");
  const events = rows
    .flatMap((r) => occurrences(r.id, r.data, from, through))
    .sort((a, b) => a.start.localeCompare(b.start));
  const shown = selected
    ? (() => {
        const row = rows.find((r) => r.id === selected);
        if (!row) return [];
        const nextYear = format(addDays(parseISO(today), 366), "yyyy-MM-dd");
        const next = occurrences(row.id, row.data, today, nextYear)[0];
        return next
          ? [next]
          : occurrences(row.id, row.data, row.data.date, row.data.date);
      })()
    : day
      ? events.filter((e) => e.date === day)
      : events;
  const cells = Array.from(
    { length: start.getDay() },
    () => null as string | null,
  ).concat(
    Array.from({ length: end.getDate() }, (_, i) =>
      format(addDays(start, i), "yyyy-MM-dd"),
    ),
  );
  return (
    <>
      <PageTitle
        title="Calendar"
        detail="Game days, practice, café events, birthdays"
      />
      <ToggleForm label="Create event">
        {(close) => <EventForm initialDate={day || today} close={close} />}
      </ToggleForm>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous month"
            onClick={() => {
              setMonth(format(addMonths(start, -1), "yyyy-MM-dd"));
              setDay(null);
              setSelected("");
            }}
          >
            <CaretLeft />
          </Button>
          <h2 className="text-xl font-semibold">
            {format(start, "MMMM yyyy")}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Next month"
            onClick={() => {
              setMonth(format(addMonths(start, 1), "yyyy-MM-dd"));
              setDay(null);
              setSelected("");
            }}
          >
            <CaretRight />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setMonth(today.slice(0, 7) + "-01");
              setDay(null);
              setSelected("");
            }}
          >
            Today
          </Button>
          {["month", "agenda"].map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "secondary" : "ghost"}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v === "month" ? "Month" : "Agenda"}
            </Button>
          ))}
        </div>
      </div>
      {view === "month" && (
        <section aria-label={format(start, "MMMM yyyy")} className="panel mb-6">
          <div className="grid grid-cols-7 gap-0 sm:gap-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div className="meta-label pb-4 text-center" key={d}>
                {d}
              </div>
            ))}
            {cells.map((d, index) =>
              d ? (
                <button
                  key={d}
                  className={`min-h-16 min-w-0 rounded-md px-0 py-2 text-center transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-2 focus-visible:outline-primary sm:min-h-24 sm:px-2 ${day === d ? "bg-primary text-primary-foreground" : d === today ? "bg-secondary text-primary" : "hover:bg-secondary"}`}
                  aria-pressed={day === d}
                  aria-label={`${d}, ${events.filter((e) => e.date === d).length} events`}
                  onClick={() => {
                    setDay(day === d ? null : d);
                    setSelected("");
                  }}
                >
                  <span className="block text-sm tabular-nums">
                    {Number(d.slice(-2))}
                  </span>
                  {events.some((e) => e.date === d) && (
                    <span
                      className={`mt-2 block text-xs ${day === d ? "text-primary-foreground" : "text-muted-foreground"}`}
                    >
                      {events.filter((e) => e.date === d).length}
                      <span className="hidden sm:inline"> events</span>
                    </span>
                  )}
                </button>
              ) : (
                <div key={`blank:${index}`} />
              ),
            )}
          </div>
        </section>
      )}
      {(selected || day) && (
        <div className="mb-4 flex items-center gap-4">
          <h2 className="text-lg font-medium">
            {selected ? "Selected event" : day}
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelected("");
              setDay(null);
            }}
          >
            Show all
          </Button>
        </div>
      )}
      {editing && (
        <section
          id="event-editor"
          tabIndex={-1}
          aria-label="Event editor"
          className="panel mb-6"
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {editing.occurrence ? "Edit occurrence" : "Edit event"}
            </h2>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close editor"
              onClick={() => setEditing(null)}
            >
              <X />
            </Button>
          </div>
          <EventForm
            key={`${editing.record.id}:${editing.occurrence?.date || "series"}`}
            record={editing.record}
            occurrence={editing.occurrence}
            close={() => setEditing(null)}
          />
        </section>
      )}
      {shown.length === 0 ? (
        <section className="panel">
          <CalendarBlank size={32} className="text-primary" />
          <Empty>No events {day ? "on this date" : "this month"}.</Empty>
        </section>
      ) : (
        <div className="grid gap-6">
          {shown.map((e) => {
            const record = rows.find((r) => r.id === e.eventId)!;
            return (
              <article key={`${e.eventId}:${e.date}`} className="panel">
                <div className="flex flex-wrap items-start gap-6">
                  <div className="w-12 shrink-0 text-center">
                    <p className="meta-label">
                      {format(parseISO(e.date), "MMM")}
                    </p>
                    <p className="text-3xl font-medium tabular-nums">
                      {Number(e.date.slice(-2))}
                    </p>
                    <p className="meta-label mt-1">
                      {format(parseISO(e.date), "EEE")}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="break-words text-xl font-semibold">
                        {e.title}
                      </h2>
                      <span className="tag">{e.category}</span>
                    </div>
                    <p className="subtle mt-2">
                      {e.allDay
                        ? "All day"
                        : `${formatInTimeZone(new Date(e.start), TIME_ZONE, "h:mm a")}${e.end ? ` to ${formatInTimeZone(new Date(e.end), TIME_ZONE, "h:mm a")}` : ""} Pacific`}
                      {e.recurrence !== "none"
                        ? ` · Repeats ${e.recurrence}`
                        : ""}
                    </p>
                    {e.location && (
                      <p className="mt-3 break-words text-sm">{e.location}</p>
                    )}
                    {e.notes && (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {e.notes}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing({ record })}
                      >
                        Edit {e.recurrence === "none" ? "event" : "series"}
                      </Button>
                      {e.recurrence !== "none" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setEditing({ record, occurrence: e })
                            }
                          >
                            Edit this date
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              void run(
                                () =>
                                  mutate({
                                    action: "exception",
                                    kind: "event",
                                    id: record.id,
                                    revision: record.revision,
                                    data: { date: e.date, cancelled: true },
                                  }),
                                "Occurrence cancelled. Edit the series to restore cancelled dates.",
                              )
                            }
                          >
                            Cancel this date
                          </Button>
                        </>
                      )}
                      <DeleteRecord record={record} />
                    </div>
                    <Attachments eventId={e.eventId} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {rows.length > 0 && (
        <details className="panel mt-6">
          <summary className="text-sm font-medium">
            Manage events ({rows.length})
          </summary>
          <div className="mt-4">
            {rows.map((row) => (
              <div key={row.id} className="row flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{row.data.title}</p>
                  <p className="subtle mt-1">
                    {row.data.date} ·{" "}
                    {row.data.recurrence === "none"
                      ? "One date"
                      : `Repeats ${row.data.recurrence}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing({ record: row })}
                >
                  Edit event
                </Button>
                <DeleteRecord record={row} />
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
function EventForm({
  initialDate,
  record,
  occurrence,
  close,
}: {
  initialDate?: string;
  record?: HubRecord<"event">;
  occurrence?: Occurrence;
  close: () => void;
}) {
  const { run, mutate } = useHub();
  const d = occurrence || record?.data;
  const [category, setCategory] = useState(d?.category ?? "Other"),
    [allDay, setAllDay] = useState(d?.allDay ?? false);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const fields = {
          title: f.get("title"),
          category,
          time: f.get("time") || "09:00",
          endTime: f.get("endTime") || null,
          allDay,
          location: f.get("location"),
          notes: f.get("notes"),
        };
        void run(async () => {
          if (occurrence && record)
            await mutate({
              action: "exception",
              kind: "event",
              id: record.id,
              revision: record.revision,
              data: {
                date: occurrence.occurrenceDate,
                cancelled: false,
                patch: fields,
              },
            });
          else
            await mutate({
              action: record ? "update" : "create",
              kind: "event",
              id: record?.id,
              revision: record?.revision,
              data: {
                ...fields,
                date: f.get("date"),
                recurrence: f.get("recurrence"),
                until: f.get("until") || null,
                exceptions: (record?.data.exceptions || []).filter(
                  (e) => !f.get("restoreCancelled") || !e.cancelled,
                ),
              },
            });
          close();
        });
      }}
    >
      <Field label="Event title">
        <Input name="title" required maxLength={200} defaultValue={d?.title} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => {
              const c = e.target.value as FamilyEvent["category"];
              setCategory(c);
              if (c === "Birthday") setAllDay(true);
            }}
          >
            {[
              "Game day",
              "Practice",
              "Café",
              "Birthday",
              "Gathering",
              "Other",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        {!occurrence && (
          <Field label="Date">
            <Input
              name="date"
              type="date"
              required
              defaultValue={d?.date || initialDate}
            />
          </Field>
        )}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
        />
        All day
      </label>
      {!allDay && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start time (Pacific)">
            <Input
              type="time"
              name="time"
              required
              defaultValue={d?.time || "09:00"}
            />
          </Field>
          <Field label="End time (optional)">
            <Input type="time" name="endTime" defaultValue={d?.endTime || ""} />
          </Field>
        </div>
      )}
      {!occurrence && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Repeat">
            <select
              name="recurrence"
              key={category === "Birthday" ? "birthday" : "other"}
              defaultValue={
                record?.data.recurrence ||
                (category === "Birthday" ? "yearly" : "none")
              }
            >
              {["none", "daily", "weekly", "monthly", "yearly"].map((v) => (
                <option key={v} value={v}>
                  {v === "none"
                    ? "Does not repeat"
                    : v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Repeat until (optional)">
            <Input
              type="date"
              name="until"
              defaultValue={record?.data.until || ""}
            />
          </Field>
        </div>
      )}
      <Field label="Location">
        <Input name="location" maxLength={500} defaultValue={d?.location} />
      </Field>
      <Field label="Notes">
        <textarea name="notes" maxLength={10000} defaultValue={d?.notes} />
      </Field>
      {!occurrence && record?.data.exceptions.some((e) => e.cancelled) && (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="restoreCancelled" />
          Restore cancelled dates
        </label>
      )}
      <p className="subtle">
        {allDay
          ? "Reminder at 9 a.m. Pacific on the event date."
          : "Reminders one day and one hour before the event."}
      </p>
      <div className="flex gap-3">
        <Submit>{record ? "Save event" : "Create event"}</Submit>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
function Attachments({ eventId }: { eventId: string }) {
  const { snapshot, pending, run } = useHub();
  const [file, setFile] = useState<File | null>(null),
    [progress, setProgress] = useState<number | null>(null),
    [confirm, setConfirm] = useState("");
  const files = snapshot.attachments.filter((a) => a.eventId === eventId);
  return (
    <details className="mt-6">
      <summary className="text-sm">
        <span className="inline-flex items-center gap-2">
          <Paperclip size={16} />
          Attachments{files.length ? ` (${files.length})` : ""}
        </span>
      </summary>
      <div className="mt-4 space-y-4">
        {files.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center gap-3 rounded-md bg-secondary p-3"
          >
            <DownloadSimple size={16} />
            <a
              href={`/api/attachments/${a.id}`}
              className="min-w-0 flex-1 break-words text-sm underline"
            >
              {a.filename}
            </a>
            <span className="subtle">
              {(a.size / 1024 / 1024).toFixed(1)} MB
            </span>
            {confirm === a.id ? (
              <>
                <Button
                  size="sm"
                  disabled={pending}
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      await api(`/api/attachments/${a.id}`, {}, "DELETE");
                      setConfirm("");
                    }, "File deleted.")
                  }
                >
                  Delete file
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirm("")}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete attachment ${a.filename}`}
                onClick={() => setConfirm(a.id)}
              >
                <Trash />
              </Button>
            )}
          </div>
        ))}
        <Field label="Choose attachment (up to 25 MB)">
          <Input
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.xlsx,.pptx,.txt"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
        <p className="subtle">
          Images, PDF, Office documents, or text. Attachments are shared across
          all dates of a recurring event.
        </p>
        {progress !== null && (
          <div role="status">
            <progress
              aria-label="Upload progress"
              value={progress}
              max={100}
              className="w-full accent-primary"
            />
            <span className="subtle">
              {progress === 100 ? "Saving file…" : `Uploading ${progress}%`}
            </span>
          </div>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={!file || pending}
          onClick={() =>
            void run(async () => {
              if (!file || file.size > 25 * 1024 * 1024)
                throw new Error("Choose a file no larger than 25 MB.");
              setProgress(0);
              try {
                await new Promise<void>((resolve, reject) => {
                  const xhr = new XMLHttpRequest();
                  const form = new FormData();
                  form.set("eventId", eventId);
                  form.set("file", file);
                  xhr.open("POST", "/api/attachments");
                  xhr.timeout = 120000;
                  xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable)
                      setProgress(Math.round((e.loaded / e.total) * 100));
                  };
                  xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) resolve();
                    else {
                      let message = "Upload failed. Try again.";
                      try {
                        message = JSON.parse(xhr.responseText).error || message;
                      } catch {}
                      reject(new Error(message));
                    }
                  };
                  xhr.onerror = () =>
                    reject(new Error("Upload connection failed. Try again."));
                  xhr.ontimeout = () =>
                    reject(new Error("Upload timed out. Try again."));
                  xhr.send(form);
                });
                setFile(null);
              } finally {
                setProgress(null);
              }
            }, "File uploaded.")
          }
        >
          Upload file
        </Button>
      </div>
    </details>
  );
}
