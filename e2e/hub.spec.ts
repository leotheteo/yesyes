import {
  test,
  expect,
  request as requestFactory,
  type APIRequestContext,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { createServer, type Server } from "node:http";
import { produceReminders } from "../src/lib/reminder-worker";

const origin = "http://localhost:3100";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const password = "Local-testing-password-48392";
let owner: APIRequestContext, member: APIRequestContext;
let eventId = "",
  listId = "",
  itemId = "",
  attachmentId = "";
let service: Server,
  serviceUrl = "",
  submissions = 0;
const tokenHash = (v: string) => createHash("sha256").update(v).digest("hex");
async function write(ctx: APIRequestContext, payload: unknown) {
  const r = await ctx.post("/api/records", { data: payload });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
test.describe.serial("household", () => {
  test.beforeAll(async () => {
    if (!process.env.DATABASE_URL?.endsWith("/family_e2e"))
      throw new Error("Tests require the disposable family_e2e database.");
    // This database is exclusively owned by these tests.
    for (const table of [
      "Notification",
      "Attachment",
      "MediaRequest",
      "Record",
      "Integration",
      "AccessLink",
      "Session",
      "Account",
      "User",
      "RateBucket",
      "RateLimit",
      "Household",
    ])
      await db.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    await db.household.create({ data: {} });
    owner = await requestFactory.newContext({
      baseURL: origin,
      extraHTTPHeaders: { Origin: origin },
    });
    member = await requestFactory.newContext({
      baseURL: origin,
      extraHTTPHeaders: { Origin: origin },
    });
    service = createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/v1/search?query=Test&page=1") {
        res.end(
          JSON.stringify({
            results: [{ id: 42, title: "Test Film", mediaType: "movie" }],
          }),
        );
        return;
      }
      if (req.url === "/api/v1/movie/42") {
        res.end(
          JSON.stringify({
            id: 42,
            title: "Test Film",
            mediaInfo: {
              status: submissions ? 3 : 1,
              requests: submissions ? [{ id: 7, status: 2 }] : [],
            },
          }),
        );
        return;
      }
      if (req.url === "/api/v1/request" && req.method === "POST") {
        submissions++;
        res.end(JSON.stringify({ id: 7, status: 2 }));
        return;
      }
      if (req.url?.startsWith("/Items/Latest")) {
        res.end(
          JSON.stringify([{ Id: "abc123", Name: "Test Film", Type: "Movie" }]),
        );
        return;
      }
      res.statusCode = 503;
      res.end(JSON.stringify({ error: "unavailable" }));
    });
    await new Promise<void>((resolve) =>
      service.listen(0, "127.0.0.1", resolve),
    );
    serviceUrl = `http://127.0.0.1:${(service.address() as { port: number }).port}`;
  });
  test.afterAll(async () => {
    await owner?.dispose();
    await member?.dispose();
    service?.close();
    await db.$disconnect();
  });

  test("bootstrap, sign in, invite a member, and reject replay", async () => {
    const token = randomBytes(32).toString("base64url");
    await db.accessLink.create({
      data: {
        kind: "setup",
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const payload = {
      action: "redeem",
      token,
      name: "Mina",
      email: "mina@example.test",
      password,
    };
    const redeem = await owner.post("/api/access", { data: payload });
    expect(redeem.ok(), await redeem.text()).toBeTruthy();
    expect((await owner.post("/api/access", { data: payload })).status()).toBe(
      400,
    );
    const signin = await owner.post("/api/auth/sign-in/email", {
      data: { email: payload.email, password },
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();
    const invite = await owner.post("/api/access", {
      data: { action: "invite", email: "samir@example.test" },
    });
    expect(invite.ok(), await invite.text()).toBeTruthy();
    const link = new URL((await invite.json()).url);
    const joined = await member.post("/api/access", {
      data: {
        action: "redeem",
        token: link.searchParams.get("token"),
        name: "Samir",
        password,
      },
    });
    expect(joined.ok(), await joined.text()).toBeTruthy();
    const signed = await member.post("/api/auth/sign-in/email", {
      data: { email: "samir@example.test", password },
    });
    expect(signed.ok(), await signed.text()).toBeTruthy();
  });
  test("requires sign-in, denies member settings, and checks origins", async ({
    request,
  }) => {
    expect((await request.get("/api/snapshot")).status()).toBe(401);
    expect(
      (
        await member.post("/api/settings", {
          data: { id: "google", key: "test-key" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await owner.post("/api/records", {
          headers: { Origin: "https://other.invalid" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await owner.post("/api/auth/sign-up/email", {
          data: { name: "Unexpected", email: "x@example.test", password },
        })
      ).ok(),
    ).toBe(false);
  });
  test("shares shopping changes, rejects stale edits, and restores deletion", async () => {
    const list = await write(owner, {
      action: "create",
      kind: "list",
      data: { name: "Groceries" },
    });
    listId = list.id;
    const item = await write(owner, {
      action: "create",
      kind: "item",
      data: {
        listId,
        name: "Mandarins",
        quantity: 2,
        unit: "bags",
        category: "Produce",
        store: "Market",
        price: 4.75,
      },
    });
    itemId = item.id;
    const checked = await write(member, {
      action: "update",
      kind: "item",
      id: item.id,
      revision: item.revision,
      data: { ...item.data, checked: true },
    });
    const stale = await owner.post("/api/records", {
      data: {
        action: "update",
        kind: "item",
        id: item.id,
        revision: item.revision,
        data: { ...item.data, name: "Stale" },
      },
    });
    expect(stale.status()).toBe(409);
    const deleted = await write(owner, {
      action: "delete",
      kind: "item",
      id: item.id,
      revision: checked.revision,
    });
    await write(member, {
      action: "restore",
      kind: "item",
      id: item.id,
      revision: deleted.revision,
    });
    const snap = await (await owner.get("/api/snapshot")).json();
    expect(
      snap.records.find((r: { id: string }) => r.id === item.id).data.checked,
    ).toBe(true);
  });
  test("prevents concurrent updates from both succeeding", async () => {
    const row = await db.record.findUniqueOrThrow({ where: { id: itemId } });
    const data = row.data as object;
    const results = await Promise.all(
      [owner, member].map((ctx, index) =>
        ctx.post("/api/records", {
          data: {
            action: "update",
            kind: "item",
            id: row.id,
            revision: row.revision,
            data: { ...data, quantity: index + 3, checked: false },
          },
        }),
      ),
    );
    expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
  });
  test("draws on the server, exhausts rerolls, and records a visit once", async () => {
    const r = await write(owner, {
      action: "create",
      kind: "restaurant",
      data: { name: "Cedar Kitchen", cuisine: "Mediterranean", price: 19.5 },
    });
    const people = await db.user.findMany();
    let poll = await write(owner, {
      action: "create",
      kind: "voteSession",
      data: {
        title: "Saturday dinner",
        participants: people.map((p) => p.id),
        budget: 25,
        closesAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });
    poll = await write(member, {
      action: "vote",
      kind: "voteSession",
      id: poll.id,
      revision: poll.revision,
      data: { restaurantId: r.id, vote: "yes" },
    });
    poll = await write(owner, {
      action: "draw",
      kind: "voteSession",
      id: poll.id,
      revision: poll.revision,
    });
    expect(poll.data.selectedId).toBe(r.id);
    expect(
      (
        await owner.post("/api/records", {
          data: {
            action: "draw",
            kind: "voteSession",
            id: poll.id,
            revision: poll.revision,
          },
        })
      ).status(),
    ).toBe(409);
    poll = await write(owner, {
      action: "finalize",
      kind: "voteSession",
      id: poll.id,
      revision: poll.revision,
    });
    poll = await write(owner, {
      action: "visit",
      kind: "voteSession",
      id: poll.id,
      revision: poll.revision,
    });
    expect(
      (
        await owner.post("/api/records", {
          data: {
            action: "visit",
            kind: "voteSession",
            id: poll.id,
            revision: poll.revision,
          },
        })
      ).status(),
    ).toBe(409);
  });
  test("creates recurring practice and a server-stored attachment", async ({
    request,
  }) => {
    const event = await write(owner, {
      action: "create",
      kind: "event",
      data: {
        title: "Saturday practice",
        category: "Practice",
        date: "2026-11-21",
        time: "10:00",
        endTime: "11:30",
        recurrence: "weekly",
        location: "Community field",
        notes: "Bring water and cleats.",
      },
    });
    eventId = event.id;
    const upload = await owner.post("/api/attachments", {
      multipart: {
        eventId,
        file: {
          name: "schedule.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Practice: Saturday at 10 a.m."),
        },
      },
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    attachmentId = (await upload.json()).id;
    expect(
      (await request.get(`/api/attachments/${attachmentId}`)).status(),
    ).toBe(401);
    const download = await member.get(`/api/attachments/${attachmentId}`);
    expect(download.ok()).toBeTruthy();
    expect(await download.text()).toContain("Practice:");
    expect(download.headers()["content-disposition"]).toContain("attachment;");
    const invalid = await owner.post("/api/attachments", {
      multipart: {
        eventId,
        file: {
          name: "bad.png",
          mimeType: "image/png",
          buffer: Buffer.from("<script>invalid</script>"),
        },
      },
    });
    expect(invalid.status()).toBe(400);
  });
  test("media integration deduplicates requests and reports service outages", async () => {
    for (const id of ["seerr", "jellyfin"]) {
      const result = await owner.post("/api/settings", {
        data: {
          id,
          url: serviceUrl,
          key: "fixture-private-key",
          publicUrl: "https://media.example.test",
        },
      });
      expect(result.ok(), await result.text()).toBeTruthy();
    }
    const saved = await db.integration.findUniqueOrThrow({
      where: { id: "seerr" },
    });
    expect(saved.encrypted).not.toContain("fixture-private-key");
    const search = await owner.get("/api/media?q=Test");
    expect(search.ok()).toBeTruthy();
    expect((await search.json())[0].title).toBe("Test Film");
    const payload = { tmdbId: 42, mediaType: "movie" };
    expect(
      (await owner.post("/api/media", { data: payload })).ok(),
    ).toBeTruthy();
    expect(
      (await member.post("/api/media", { data: payload })).ok(),
    ).toBeTruthy();
    expect(submissions).toBe(1);
    expect(
      (await (await owner.get("/api/media?recent=1")).json())[0].title,
    ).toBe("Test Film");
    expect((await owner.get("/api/media?q=Unavailable")).status()).toBe(502);
  });
  test("server reminders are deduplicated across repeated worker cycles", async () => {
    expect(
      await produceReminders(new Date("2026-11-21T17:30:00Z")),
    ).toBeGreaterThan(0);
    const count = await db.notification.count();
    expect(await produceReminders(new Date("2026-11-21T17:31:00Z"))).toBe(0);
    expect(await db.notification.count()).toBe(count);
    const snap = await (await owner.get("/api/snapshot")).json();
    expect(snap.notifications.length).toBeGreaterThan(0);
  });
  test("browser changes are confirmed and broadcast to another connected browser", async ({
    browser,
  }) => {
    const first = await browser.newContext({
      storageState: await owner.storageState(),
    });
    const second = await browser.newContext({
      storageState: await member.storageState(),
    });
    const a = await first.newPage(),
      b = await second.newPage();
    await Promise.all([a.goto("/shopping"), b.goto("/shopping")]);
    await expect(
      a.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    await expect(
      b.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    await a.getByRole("button", { name: "Add item", exact: true }).click();
    await a
      .getByRole("textbox", { name: "Item", exact: true })
      .fill("Oat milk");
    await a.getByRole("button", { name: "Add item", exact: true }).click();
    await expect(b.getByText("Oat milk", { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await b.getByRole("checkbox", { name: "Check off Oat milk" }).click();
    await expect(
      a.getByRole("checkbox", { name: "Uncheck Oat milk" }),
    ).toBeChecked({ timeout: 10000 });
    // A fresh page must recover the server state without any browser persistence.
    await a.reload();
    await expect(
      a.getByRole("checkbox", { name: "Uncheck Oat milk" }),
    ).toBeChecked();
    await first.close();
    await second.close();
  });
  test("renders the actual screens at desktop and 320px without clipping", async ({
    page,
  }) => {
    await page.context().addCookies((await owner.storageState()).cookies);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const section of [
        "/",
        "/shopping",
        "/food",
        "/calendar",
        "/media",
        "/settings",
        "/notifications",
      ]) {
        await page.goto(section);
        await expect(
          page.getByRole("navigation", { name: "Main navigation" }),
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await expect(page.locator("body")).not.toContainText("—");
        if (width === 1440 || section === "/calendar")
          await page.screenshot({
            path: `test-results/${width}-${section === "/" ? "home" : section.slice(1)}.png`,
            fullPage: true,
          });
      }
    }
    expect(errors).toEqual([]);
  });
  test("checks keyboard focus, accessibility, reduced motion, and 200 percent layout", async ({
    page,
  }) => {
    await page.context().addCookies((await owner.storageState()).cookies);
    await page.setViewportSize({ width: 640, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of ["/", "/shopping", "/calendar", "/media"]) {
      await page.goto(path);
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.description}`)).toEqual(
        [],
      );
      expect(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).scrollBehavior,
        ),
      ).toBe("auto");
    }
    await page.goto("/");
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByText("Skip to content")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#content")).toBeFocused();
    // A 320 CSS-pixel viewport checks the reflow required by 200% browser zoom
    // from a 640-pixel viewport. CSS zoom does not update media queries.
    await page.setViewportSize({ width: 320, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
  test("calendar form creates a birthday and uploads its attachment", async ({
    page,
  }) => {
    await page.context().addCookies((await owner.storageState()).cookies);
    await page.goto("/calendar");
    await page
      .getByRole("button", { name: "Create event", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Event title", exact: true })
      .fill("Leila’s birthday");
    await page.getByLabel("Category", { exact: true }).selectOption("Birthday");
    await expect(page.getByRole("checkbox", { name: "All day" })).toBeChecked();
    await expect(page.getByLabel("Repeat", { exact: true })).toHaveValue(
      "yearly",
    );
    await page.getByLabel("Date", { exact: true }).fill("2026-11-22");
    await page
      .getByRole("button", { name: "Create event", exact: true })
      .click();
    const article = page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "Leila’s birthday",
        exact: true,
      }),
    });
    await expect(article).toBeVisible();
    await article.locator("summary").click();
    await article.locator('input[type="file"]').setInputFiles({
      name: "birthday-notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Cake pickup at 11 a.m."),
    });
    await article
      .getByRole("button", { name: "Upload file", exact: true })
      .click();
    await expect(
      article.getByRole("link", { name: "birthday-notes.txt" }),
    ).toBeVisible();
    await article
      .getByRole("button", { name: "Delete attachment birthday-notes.txt" })
      .click();
    await article
      .getByRole("button", { name: "Delete file", exact: true })
      .click();
    await expect(
      article.getByRole("link", { name: "birthday-notes.txt" }),
    ).toHaveCount(0);
  });
  test("loading and failed snapshots offer a working recovery path", async ({
    page,
  }) => {
    await page.context().addCookies((await owner.storageState()).cookies);
    let release: () => void = () => {};
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/snapshot", async (route) => {
      await hold;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Server unavailable. Try again." }),
      });
    });
    await page.goto("/");
    await expect(
      page.getByRole("main", { name: "Loading family hub" }),
    ).toBeVisible();
    release();
    await expect(
      page.getByRole("heading", { name: "Could not load the hub" }),
    ).toBeVisible();
    await page.unroute("**/api/snapshot");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
  });
  test("sign-in form establishes a server session", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("mina@example.test");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
  });
  test("password reset invalidates sessions", async () => {
    const reset = await owner.post("/api/access", {
      data: { action: "reset", email: "samir@example.test" },
    });
    expect(reset.ok(), await reset.text()).toBeTruthy();
    const token = new URL((await reset.json()).url).searchParams.get("token");
    const result = await owner.post("/api/access", {
      data: { action: "redeem", token, password: password + "-new" },
    });
    expect(result.ok(), await result.text()).toBeTruthy();
    expect((await member.get("/api/snapshot")).status()).toBe(401);
  });
});
