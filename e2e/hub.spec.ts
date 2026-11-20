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
const jfMina = "11111111111111111111111111111111",
  jfSamir = "22222222222222222222222222222222";
const jfFavorite = new Map<string, boolean>(),
  jfPlayed = new Map<string, boolean>();
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
function samplePdf() {
  const stream = "0.5 g 20 20 100 80 re f";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 6 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((value, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${value}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 7\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
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
      const remote = new URL(req.url || "/", "http://fixture");
      const profile =
        remote.searchParams.get("UserId") ||
        remote.searchParams.get("userId") ||
        jfMina;
      const movies = [
        {
          Id: "abc123",
          Name: "Test Film",
          Type: "Movie",
          Overview: "A family film.",
          ProductionYear: 2024,
          RunTimeTicks: 54000000000,
          Genres: ["Drama"],
          ImageTags: { Primary: "poster1" },
          UserData: {
            IsFavorite: jfFavorite.get(profile) || false,
            Played: jfPlayed.get(profile) || false,
            PlaybackPositionTicks: 27000000000,
          },
        },
        { Id: "def456", Name: "Evening Film", Type: "Movie", Genres: [] },
        { Id: "series01", Name: "Test Series", Type: "Series", Genres: [] },
      ];
      if (remote.pathname === "/Users") {
        res.end(
          JSON.stringify([
            { Id: jfMina, Name: "Mina", Policy: {} },
            { Id: jfSamir, Name: "Samir", Policy: {} },
          ]),
        );
        return;
      }
      if (
        remote.pathname === `/Users/${jfMina}` ||
        remote.pathname === `/Users/${jfSamir}`
      ) {
        res.end(
          JSON.stringify({
            Id: remote.pathname.split("/")[2],
            Name: "Profile",
          }),
        );
        return;
      }
      if (/^\/Users\/[^/]+\/Views$/.test(remote.pathname)) {
        res.end(
          JSON.stringify({
            Items: [
              { Id: "library123", Name: "Movies", Type: "CollectionFolder" },
            ],
          }),
        );
        return;
      }
      const itemPath = /^\/Users\/([^/]+)\/Items\/([^/]+)$/.exec(
        remote.pathname,
      );
      if (itemPath) {
        const p = itemPath[1];
        const movie = movies.find((m) => m.Id === itemPath[2]);
        const result = movie
          ? {
              ...movie,
              UserData: {
                IsFavorite: jfFavorite.get(p) || false,
                Played: jfPlayed.get(p) || false,
              },
            }
          : itemPath[2] === "episode01"
            ? {
                Id: "episode01",
                Name: "Episode one",
                Type: "Episode",
                SeriesName: "Test Series",
                IndexNumber: 1,
                ParentIndexNumber: 1,
              }
            : null;
        res.statusCode = result ? 200 : 404;
        res.end(JSON.stringify(result || {}));
        return;
      }
      const change =
        /^\/Users\/([^/]+)\/(FavoriteItems|PlayedItems)\/([^/]+)$/.exec(
          remote.pathname,
        );
      if (change) {
        (change[2] === "FavoriteItems" ? jfFavorite : jfPlayed).set(
          change[1],
          req.method === "POST",
        );
        res.statusCode = 204;
        res.end();
        return;
      }
      if (remote.pathname === "/Items" || remote.pathname === "/Items/Resume") {
        const q = remote.searchParams.get("SearchTerm")?.toLowerCase();
        let items = movies.filter(
          (m) => !q || m.Name.toLowerCase().includes(q),
        );
        const type = remote.searchParams.get("IncludeItemTypes");
        if (type) items = items.filter((m) => type.split(",").includes(m.Type));
        if (remote.searchParams.get("Filters") === "IsFavorite")
          items = items.filter((m) => m.UserData?.IsFavorite);
        res.end(
          JSON.stringify({ Items: items, TotalRecordCount: items.length }),
        );
        return;
      }
      if (
        remote.pathname === "/Shows/NextUp" ||
        remote.pathname === "/Shows/series01/Episodes"
      ) {
        res.end(
          JSON.stringify({
            Items: [
              {
                Id: "episode01",
                Name: "Episode one",
                Type: "Episode",
                SeriesName: "Test Series",
                IndexNumber: 1,
                ParentIndexNumber: 1,
              },
            ],
            TotalRecordCount: 1,
          }),
        );
        return;
      }
      if (/^\/Items\/[^/]+\/Images\/Primary$/.test(remote.pathname)) {
        res.setHeader("Content-Type", "image/png");
        res.end(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQ1sAAAAASUVORK5CYII=",
            "base64",
          ),
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
          ...(id === "jellyfin" ? { userId: jfMina } : {}),
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
  test("attachment previews enforce access, ranges, and render PDF pages", async ({
    page,
    request,
  }) => {
    expect(
      (await request.get(`/api/attachments/${attachmentId}/preview`)).status(),
    ).toBe(401);
    const text = await owner.get(`/api/attachments/${attachmentId}/preview`);
    expect(await text.text()).toContain("Practice:");
    const pdf = await owner.post("/api/attachments", {
      multipart: {
        eventId,
        file: {
          name: "practice-guide.pdf",
          mimeType: "application/pdf",
          buffer: samplePdf(),
        },
      },
    });
    expect(pdf.ok(), await pdf.text()).toBeTruthy();
    const pdfId = (await pdf.json()).id;
    const range = await owner.get(`/api/attachments/${pdfId}/preview`, {
      headers: { Range: "bytes=0-9" },
    });
    expect(range.status()).toBe(206);
    expect((await range.body()).length).toBe(10);
    expect(range.headers()["cache-control"]).toContain("private");
    await page.context().addCookies((await owner.storageState()).cookies);
    await page.goto(`/calendar?event=${eventId}&attachment=${pdfId}`);
    await expect(page.getByText("Page 1 of 2", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Loading PDF page…", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.getByText("Page 2 of 2", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Loading PDF page…", { exact: true }),
    ).toHaveCount(0);
    expect(
      await page
        .getByRole("img", { name: "practice-guide.pdf, page 2" })
        .evaluate((canvas: HTMLCanvasElement) => canvas.width),
    ).toBeGreaterThan(0);
    await page.screenshot({
      path: "test-results/pdf-preview.png",
      fullPage: true,
    });
  });
  test("global search finds shared records and attachments without deleted data", async ({
    page,
  }) => {
    const result = await owner.get("/api/search?q=Mandarins");
    expect(result.ok(), await result.text()).toBeTruthy();
    expect(
      (await result.json()).hits.some((h: { id: string }) => h.id === itemId),
    ).toBe(true);
    const attachments = await (
      await owner.get("/api/search?q=schedule.txt")
    ).json();
    expect(
      attachments.hits.some((h: { id: string }) => h.id === attachmentId),
    ).toBe(true);
    const restaurant = await write(owner, {
      action: "create",
      kind: "restaurant",
      data: { name: "Hiddenneedle" },
    });
    await write(owner, {
      action: "delete",
      kind: "restaurant",
      id: restaurant.id,
      revision: restaurant.revision,
    });
    expect(
      (await (await owner.get("/api/search?q=Hiddenneedle")).json()).hits,
    ).toEqual([]);
    expect(
      (
        await (
          await owner.get(`/api/search?q=${encodeURIComponent("' OR 1=1 --")}`)
        ).json()
      ).hits,
    ).toEqual([]);
    await page.context().addCookies((await owner.storageState()).cookies);
    await page.goto("/search?q=Mandarins");
    await page.getByRole("link").filter({ hasText: "Mandarins" }).click();
    await expect(
      page.getByRole("heading", { name: "Groceries", exact: true }),
    ).toBeVisible();
  });
  test("Jellyfin profiles isolate personal state and expose library, episodes, and posters", async ({
    request,
  }) => {
    const people = await db.user.findMany();
    const mina = people.find((p) => p.email === "mina@example.test")!,
      samir = people.find((p) => p.email === "samir@example.test")!;
    expect((await member.get("/api/jellyfin?view=profiles")).status()).toBe(
      403,
    );
    expect(
      (
        await member.post("/api/jellyfin", {
          data: { action: "favorite", itemId: "abc123", value: true },
        })
      ).status(),
    ).toBe(409);
    for (const [userId, jellyfinUserId] of [
      [mina.id, jfMina],
      [samir.id, jfSamir],
    ]) {
      const result = await owner.post("/api/jellyfin", {
        data: { action: "profile", userId, jellyfinUserId },
      });
      expect(result.ok(), await result.text()).toBeTruthy();
    }
    const library = await owner.get("/api/jellyfin");
    expect(library.ok(), await library.text()).toBeTruthy();
    expect((await library.json()).items.length).toBe(3);
    expect((await owner.get("/api/jellyfin?view=libraries")).ok()).toBeTruthy();
    expect((await owner.get("/api/jellyfin?view=resume")).ok()).toBeTruthy();
    expect(
      (
        await (
          await owner.get("/api/jellyfin?view=episodes&parent=series01")
        ).json()
      ).items[0].type,
    ).toBe("Episode");
    expect(
      (
        await owner.post("/api/jellyfin", {
          data: { action: "favorite", itemId: "abc123", value: true },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (await (await owner.get("/api/jellyfin?view=detail&id=abc123")).json())
        .item.favorite,
    ).toBe(true);
    expect(
      (await (await member.get("/api/jellyfin?view=detail&id=abc123")).json())
        .item.favorite,
    ).toBe(false);
    expect(
      (
        await owner.post("/api/jellyfin", {
          data: { action: "played", itemId: "abc123", value: true },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (await (await owner.get("/api/jellyfin?view=detail&id=abc123")).json())
        .item.played,
    ).toBe(true);
    expect((await request.get("/api/jellyfin/images/abc123")).status()).toBe(
      401,
    );
    expect(
      (await owner.get("/api/jellyfin/images/abc123")).headers()[
        "content-type"
      ],
    ).toBe("image/png");
  });
  test("watch votes enforce the winning title and create one calendar event", async () => {
    let room = await (
      await owner.post("/api/watch", {
        data: {
          action: "create",
          title: "Weekend film",
          closesAt: new Date(Date.now() + 3600000).toISOString(),
        },
      })
    ).json();
    const act = async (ctx: APIRequestContext, action: string, extra = {}) => {
      const result = await ctx.post("/api/watch", {
        data: { action, id: room.id, revision: room.revision, ...extra },
      });
      expect(result.ok(), await result.text()).toBeTruthy();
      room = await result.json();
    };
    await act(owner, "nominate", { itemId: "abc123" });
    await act(member, "nominate", { itemId: "def456" });
    await act(owner, "vote", { itemId: "abc123" });
    await act(member, "vote", { itemId: "abc123" });
    const when = {
      date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      time: "19:00",
    };
    expect(
      (
        await member.post("/api/watch", {
          data: {
            action: "schedule",
            id: room.id,
            revision: room.revision,
            itemId: "abc123",
            ...when,
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await owner.post("/api/watch", {
          data: {
            action: "schedule",
            id: room.id,
            revision: room.revision,
            itemId: "def456",
            ...when,
          },
        })
      ).status(),
    ).toBe(409);
    await act(owner, "schedule", {
      itemId: "abc123",
      ...when,
      location: "Living room",
    });
    const event = await db.record.findUniqueOrThrow({
      where: { id: room.data.eventId },
    });
    expect((event.data as { title: string }).title).toBe("Weekend film");
    expect(
      (
        await owner.post("/api/watch", {
          data: {
            action: "schedule",
            id: room.id,
            revision: room.revision,
            itemId: "abc123",
            ...when,
          },
        })
      ).status(),
    ).toBe(409);
  });
  test("account controls revoke links and disable access without removing shared content", async () => {
    const snap = await (await owner.get("/api/snapshot")).json();
    const person = await db.user.findUniqueOrThrow({
      where: { email: "samir@example.test" },
    });
    expect(
      (
        await member.post("/api/accounts", {
          data: { action: "disable", userId: snap.user.id },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await owner.post("/api/accounts", {
          data: { action: "disable", userId: snap.user.id },
        })
      ).status(),
    ).toBe(409);
    const invite = await (
      await owner.post("/api/access", {
        data: { action: "invite", email: "unused@example.test" },
      })
    ).json();
    const linkToken = new URL(invite.url).searchParams.get("token")!;
    const link = await db.accessLink.findUniqueOrThrow({
      where: { tokenHash: tokenHash(linkToken) },
    });
    expect(
      (
        await owner.post("/api/accounts", {
          data: { action: "revokeLink", id: link.id },
        })
      ).ok(),
    ).toBeTruthy();
    expect((await owner.get(`/api/access?token=${linkToken}`)).status()).toBe(
      400,
    );
    expect(
      (
        await owner.post("/api/accounts", {
          data: { action: "disable", userId: person.id },
        })
      ).ok(),
    ).toBeTruthy();
    expect((await member.get("/api/snapshot")).status()).toBe(401);
    expect(
      (
        await member.post("/api/auth/sign-in/email", {
          data: { email: person.email, password },
        })
      ).status(),
    ).toBe(403);
    expect(await db.record.count({ where: { id: itemId } })).toBe(1);
    expect(
      (
        await owner.post("/api/accounts", {
          data: { action: "enable", userId: person.id },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await member.post("/api/auth/sign-in/email", {
          data: { email: person.email, password },
        })
      ).ok(),
    ).toBeTruthy();
    const sessions = await (await member.get("/api/accounts")).json();
    expect(
      sessions.sessions.every(
        (s: { userId: string }) => s.userId === person.id,
      ),
    ).toBe(true);
  });
  test("library and watch-together controls complete a movie-night flow", async ({
    page,
  }) => {
    await page.context().addCookies((await owner.storageState()).cookies);
    await page.goto("/media?item=abc123");
    await page
      .getByRole("button", { name: "Remove favorite", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Add favorite", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Mark unwatched", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Mark watched", exact: true }),
    ).toBeVisible();
    await page.goto("/media?tab=watch");
    await page
      .getByRole("button", { name: "Start watch vote", exact: true })
      .click();
    await page
      .getByLabel("Movie night name", { exact: true })
      .fill("Browser movie night");
    await page
      .getByRole("button", { name: "Start watch vote", exact: true })
      .click();
    const room = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Browser movie night",
        exact: true,
      }),
    });
    await room
      .getByRole("button", { name: "Nominate from Jellyfin", exact: true })
      .click();
    const movie = room.getByRole("article").filter({
      has: page.getByRole("button", { name: "Open Test Film", exact: true }),
    });
    await movie.getByRole("button", { name: "Nominate", exact: true }).click();
    await room.getByRole("button", { name: "Vote", exact: true }).click();
    await expect(
      room.getByRole("button", { name: "Your vote", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await room
      .getByRole("button", { name: "Schedule movie night", exact: true })
      .click();
    await room
      .getByLabel("Movie night date", { exact: true })
      .fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
    await room
      .getByRole("button", { name: "Add movie night to Calendar", exact: true })
      .click();
    await room
      .getByRole("link", { name: "Open calendar event", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Browser movie night", exact: true }),
    ).toBeVisible();
  });
  test("new screens remain accessible at narrow widths", async ({ page }) => {
    await page.context().addCookies((await owner.storageState()).cookies);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of [
      "/search?q=Film",
      "/media",
      "/media?tab=watch",
      "/settings",
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toBeVisible();
      if (path === "/media")
        await expect(
          page.getByRole("button", { name: "Open Test Film", exact: true }),
        ).toBeVisible();
      if (path === "/settings")
        await expect(
          page.getByRole("heading", { name: "Active sessions", exact: true }),
        ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.description}`)).toEqual(
        [],
      );
      await page.screenshot({
        path: `test-results/feature-${path.includes("watch") ? "watch" : path.includes("search") ? "search" : path.includes("settings") ? "accounts" : "library"}.png`,
        fullPage: true,
      });
    }
  });
  test("session revocation and account removal preserve shared records", async () => {
    const accounts = await (await member.get("/api/accounts")).json();
    const session = accounts.sessions[0];
    expect(session.token).toBeUndefined();
    expect(
      (
        await owner.post("/api/accounts", {
          data: { action: "revokeSession", id: session.id },
        })
      ).ok(),
    ).toBeTruthy();
    expect((await member.get("/api/snapshot")).status()).toBe(401);
    expect(
      (
        await member.post("/api/auth/sign-in/email", {
          data: { email: "samir@example.test", password },
        })
      ).ok(),
    ).toBeTruthy();
    const person = await db.user.create({
      data: {
        id: "temporary-account",
        name: "Temporary",
        email: "temporary@example.test",
      },
    });
    const shared = await db.record.create({
      data: {
        kind: "list",
        createdBy: person.id,
        data: { name: "Saved shared list" },
      },
    });
    expect(
      (
        await owner.post("/api/accounts", {
          data: { action: "remove", userId: person.id },
        })
      ).ok(),
    ).toBeTruthy();
    expect(await db.user.findUnique({ where: { id: person.id } })).toBeNull();
    expect(
      await db.record.findUnique({ where: { id: shared.id } }),
    ).not.toBeNull();
    const household = await db.household.findUniqueOrThrow({
      where: { id: "family" },
    });
    expect(
      (
        await owner.post("/api/accounts", {
          data: { action: "remove", userId: household.ownerId },
        })
      ).status(),
    ).toBe(409);
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
