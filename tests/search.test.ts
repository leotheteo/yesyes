import { describe, it, expect } from "vitest";
import { searchPattern } from "../src/lib/search";
import { mapItem } from "../src/lib/jellyfin";
describe("search and Jellyfin presentation", () => {
  it("treats SQL wildcard characters as literal search text", () => {
    expect(searchPattern("50%_done\\today")).toBe("%50\\%\\_done\\\\today%");
    expect(searchPattern("O'Connor")).toBe("%O'Connor%");
  });
  it("normalizes runtime, watch progress, and credential-free image URLs", () => {
    const item = mapItem(
      {
        Id: "abc123",
        Name: "Film",
        Type: "Movie",
        RunTimeTicks: 6000000000,
        ImageTags: { Primary: "tag" },
        UserData: { PlaybackPositionTicks: 3000000000, IsFavorite: true },
      },
      "https://media.example.test/",
    );
    expect(item.minutes).toBe(10);
    expect(item.progress).toBe(50);
    expect(item.favorite).toBe(true);
    expect(item.image).toBe("/api/jellyfin/images/abc123");
    expect(item.url).toContain("/web/#/details?id=abc123");
  });
});
