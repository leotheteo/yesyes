import { describe, expect, it } from "vitest";
import { mediaStatus } from "../src/lib/integrations";
describe("Seerr states", () => {
  it("preserves blocked, removed, completed, and failed states", () => {
    expect(mediaStatus(6, 2)).toBe("blocked in Seerr");
    expect(mediaStatus(7, 5)).toBe("removed from library");
    expect(mediaStatus(3, 4)).toBe("failed");
    expect(mediaStatus(1, 5)).toBe("completed at service");
    expect(mediaStatus(5, 5)).toBe("available");
    expect(mediaStatus(4, 2)).toBe("partially available");
  });
});
