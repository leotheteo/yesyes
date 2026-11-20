import { describe, expect, it } from "vitest";
import { candidates, distanceKm, weightedPick } from "../src/lib/food";
import { occurrences, reminders } from "../src/lib/calendar";
import {
  eventSchema,
  restaurantSchema,
  voteSessionSchema,
} from "../src/lib/models";
import { inspectFile } from "../src/lib/uploads";
const restaurant = restaurantSchema.parse({
  name: "Test restaurant",
  price: 18,
});
const session = voteSessionSchema.parse({
  title: "Dinner",
  participants: ["a", "b"],
  closesAt: "2026-11-21T05:00:00.000Z",
});
const event = eventSchema.parse({
  title: "Practice",
  category: "Practice",
  date: "2026-03-01",
  time: "17:00",
  recurrence: "weekly",
});

describe("food", () => {
  it("excludes hard dislikes, vetoes, previously drawn choices, and missing filter data", () => {
    const options = candidates(
      {
        ...session,
        budget: 20,
        maxDistance: 10,
        home: { lat: 34, lng: -118 },
        draws: ["c"],
        vetoes: { a: "b" },
      },
      ["a", "b", "c"].map((id) => ({
        id,
        data: { ...restaurant, price: null },
      })),
      [{ userId: "a", restaurantId: "a", value: "exclude" }],
    );
    expect(options[0].reasons).toContain(
      "A participant excludes this restaurant",
    );
    expect(options[1].reasons).toContain("Vetoed in this vote");
    expect(options[2].reasons).toContain("Already drawn");
    expect(
      options.every(
        (o) =>
          o.reasons.includes("Price is missing") &&
          o.reasons.includes("Coordinates are missing"),
      ),
    ).toBe(true);
  });
  it("calculates weight and recent visit penalty", () => {
    const result = candidates(
      { ...session, votes: { a: { r: "yes" }, b: { r: "no" } } },
      [{ id: "r", data: { ...restaurant, visits: ["2026-11-19T18:00:00Z"] } }],
      [{ userId: "a", restaurantId: "r", value: "like" }],
      new Date("2026-11-20T18:00:00Z"),
    );
    expect(result[0].weight).toBe(2.5);
  });
  it("handles exhausted draws and weighted boundaries", () => {
    expect(weightedPick([], 0.5)).toBeUndefined();
    expect(
      weightedPick(
        [
          { weight: 1, id: "a" },
          { weight: 3, id: "b" },
        ],
        0.1,
      )?.id,
    ).toBe("a");
    expect(
      weightedPick(
        [
          { weight: 1, id: "a" },
          { weight: 3, id: "b" },
        ],
        0.8,
      )?.id,
    ).toBe("b");
    expect(distanceKm({ lat: 34, lng: -118 }, { lat: 34, lng: -118 })).toBe(0);
  });
});
describe("Pacific calendar", () => {
  it("keeps weekly practice at the same local time through spring DST", () => {
    const dates = occurrences("e", event, "2026-03-01", "2026-03-15");
    expect(dates.map((d) => d.start)).toEqual([
      "2026-03-02T01:00:00.000Z",
      "2026-03-09T00:00:00.000Z",
      "2026-03-16T00:00:00.000Z",
    ]);
  });
  it("keeps local time through fall DST", () => {
    const dates = occurrences(
      "e",
      { ...event, date: "2026-10-25" },
      "2026-10-25",
      "2026-11-08",
    );
    expect(dates.map((d) => d.start)).toEqual([
      "2026-10-26T00:00:00.000Z",
      "2026-11-02T01:00:00.000Z",
      "2026-11-09T01:00:00.000Z",
    ]);
  });
  it("preserves all-day dates and skips nonexistent birthdays", () => {
    const birthday = {
      ...event,
      date: "2024-02-29",
      category: "Birthday" as const,
      recurrence: "yearly" as const,
      allDay: true,
    };
    expect(
      occurrences("b", birthday, "2025-01-01", "2028-12-31").map((d) => d.date),
    ).toEqual(["2028-02-29"]);
    expect(
      occurrences("b", birthday, "2024-02-29", "2024-02-29")[0].start,
    ).toBe("2024-02-29T17:00:00.000Z");
  });
  it("applies occurrence changes and cancellations without modifying the series", () => {
    const dates = occurrences(
      "e",
      {
        ...event,
        exceptions: [
          { date: "2026-03-08", cancelled: true },
          {
            date: "2026-03-15",
            cancelled: false,
            patch: { title: "Final practice", time: "18:00" },
          },
        ],
      },
      "2026-03-01",
      "2026-03-15",
    );
    expect(dates).toHaveLength(2);
    expect(dates[1].title).toBe("Final practice");
    expect(dates[1].start).toBe("2026-03-16T01:00:00.000Z");
    expect(event.title).toBe("Practice");
  });
  it("creates stable reminder deduplication keys", () => {
    const a = reminders("e", event, new Date("2026-03-08T23:30:00Z"));
    const b = reminders("e", event, new Date("2026-03-08T23:31:00Z"));
    expect(a.map((r) => r.key)).toEqual(b.map((r) => r.key));
    expect(a.length).toBeGreaterThan(0);
  });
  it("rejects invalid dates and reversed end times", () => {
    expect(
      eventSchema.safeParse({ ...event, date: "2026-02-30" }).success,
    ).toBe(false);
    expect(eventSchema.safeParse({ ...event, endTime: "16:00" }).success).toBe(
      false,
    );
  });
});
describe("attachments", () => {
  it("accepts UTF-8 text and rejects renamed executable content", async () => {
    expect(
      await inspectFile(Buffer.from("Practice schedule"), "schedule.txt"),
    ).toBe("text/plain");
    await expect(
      inspectFile(Buffer.from("MZ\x00bad"), "schedule.pdf"),
    ).rejects.toThrow();
    await expect(inspectFile(Buffer.alloc(0), "empty.txt")).rejects.toThrow();
    await expect(
      inspectFile(Buffer.from("<script>bad</script>"), "image.png"),
    ).rejects.toThrow();
  });
});
