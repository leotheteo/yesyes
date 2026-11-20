# Family hub

Accounts, food votes, media requests, shopping lists, and a Pacific-time calendar with server-stored attachments.

## Run on your LXC

Use a Debian or Ubuntu LXC with Docker Engine and Docker Compose v2 installed. An unprivileged Proxmox container generally needs nesting and keyctl enabled. Confirm Docker can start a container before installing the app. Keep the container unprivileged and avoid changing host security profiles as a workaround.

1. Copy this project into the LXC.
2. Copy `.env.example` to `.env`.
3. Set `POSTGRES_PASSWORD` to a long random alphanumeric value. The Compose database URL uses that value directly.
4. Set `BETTER_AUTH_URL` to your public HTTPS origin, for example `https://family.example.com`.
5. Generate `BETTER_AUTH_SECRET` using `openssl rand -base64 48` and `ENCRYPTION_KEY` using `openssl rand -hex 32`. Keep both stable and private.
6. Run:

```sh
docker compose up -d --build
docker compose exec web npm run setup
```

Open the printed setup link within one hour. Set your name, email, and password, then sign in. Setup cannot create another owner after the first account exists. Settings creates invitation and password reset links for private sharing. No email service is required. Password reset invalidates existing sessions.

The app, worker, and migration job use PostgreSQL. Attachments live in the `attachments` volume, not the web root. Database and file volumes survive container replacement. Do not run `docker compose down -v` unless you intend to delete household data.

## HTTPS reverse proxy

Forward your public hostname to the LXC IP on port 3000. Forward the original Host and scheme. Restrict access to port 3000 to your proxy or private network, and do not expose PostgreSQL. Set `BIND_ADDRESS` if you want Docker to bind a particular LXC interface.

For nginx, include these settings in the app location:

```nginx
client_max_body_size 26m;
proxy_pass http://LXC_IP:3000;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_buffering off;
proxy_read_timeout 300s;
```

Disable response buffering for `/api/stream`. The stream polls the database revision every two seconds and checks the session on every heartbeat. A reconnect refreshes the full snapshot. All write requests must have an Origin matching `BETTER_AUTH_URL`.

## Connections

In Settings, configure only the services you use. Saved keys are encrypted with AES-256-GCM. Keys are never returned to the browser. Private service addresses must be reachable from the app container. `localhost` inside a container refers to that container, not the LXC or Proxmox host.

- **Seerr:** service URL, API key, and optional numeric user ID. Configure automatic request processing for that account in Seerr. The hub does not provide a manual processing queue. Duplicate movie and season requests are prevented. If a submission times out, the worker checks Seerr rather than blindly submitting it again. If it remains uncertain, check Seerr directly before changing the database record.
- **Jellyfin:** internal URL, API key, optional user ID, and optional public URL for playback links.
- **Google Places:** enable Places API (New), configure billing, and restrict the key to that API and your server's egress IP where practical. It is optional. The hub stores place IDs, retrieves Google details on demand, and keeps manually entered names, addresses, prices, and coordinates separate. Do not copy provider results into permanent family fields. Manual entry works without Google. Driving routes and embedded maps are not included.

Check `/privacy` and `/terms` before enabling Google. They are public, while household content requires sign-in. No analytics or advertising scripts are included.

## Calendar and attachments

The timezone is `America/Los_Angeles`. Weekly events retain their Pacific local time across daylight-saving changes. All-day events are stored as dates. Monthly or yearly dates that do not exist are skipped, including February 29 in non-leap years. Timed events start and end on the same calendar date.

The worker creates in-app reminders once per recipient, occurrence, and reminder time. Timed events use one day and one hour before; all-day events use 9 a.m. on the date. A worker restart catches reminders due in the previous 24 hours. Longer outages do not produce older reminders. No push or email delivery is included.

Each event supports up to 50 attachments of 25 MB each: PNG, JPG, WebP, GIF, PDF, DOCX, XLSX, PPTX, and UTF-8 TXT. File signatures are checked server-side. Files download as attachments; this is not a malware scanner. All household members can upload, download, and remove files. File deletion requires confirmation. Attachments belong to the event series and are shared across occurrences. Deleted events retain files so event deletion can be undone.

## Back up and restore

Back up the database, attachments, and `.env` together. The encryption key is required to read saved connections. Keep backup files private.

For a consistent backup, stop writes and the worker, then run from the project directory:

```sh
mkdir -p backups
docker compose stop web worker
docker compose exec -T db pg_dump -U family -d family -Fc > backups/family.dump
docker compose run --rm --no-deps -T --user root -v "$PWD/backups:/backup" web tar czf /backup/attachments.tar.gz -C /data/uploads .
cp .env backups/environment.env
docker compose start web worker
```

To restore into an initialized database, stop the app and worker, restore the files and database from the same backup, and restore its environment secrets before starting services:

```sh
docker compose stop web worker
docker compose exec -T db pg_restore -U family -d family --clean --if-exists < backups/family.dump
docker compose run --rm --no-deps -T --user root -v "$PWD/backups:/backup" web sh -c 'tar xzf /backup/attachments.tar.gz -C /data/uploads && chown -R node:node /data/uploads'
docker compose up -d
```

Use an empty attachments volume when restoring to avoid retaining files from a different state. Test a backup on a separate installation before relying on it.

## Development

Requires Node 24 and PostgreSQL. Docker is optional for development.

```sh
npm ci
npx prisma generate
npm run db:migrate
npm run setup
npm run dev
```

Run `npm run worker` separately. Use `http://localhost:3000` for `BETTER_AUTH_URL` during local development. Production HTTPS enables secure cookies automatically.

For a local development PostgreSQL instance, `npm run dev:db` starts the bundled PostgreSQL on port 55432 and stores its data in the ignored `test-data/postgres` directory. Its development connection URL is `postgresql://family:local-development-only@127.0.0.1:55432/family`. Keep it local and do not use that password on the LXC deployment.

```sh
npm run typecheck
npm test
npm run build
```

For browser and API tests, start the development database, run `npx playwright install chromium`, build the app, then run `npm run test:e2e`. The runner creates and migrates `family_e2e` and deletes its contents before testing. Never use that database for household data. Set `TEST_DATABASE_URL` to use a different PostgreSQL server with the same disposable database name. These tests use local media fixtures, not live Seerr, Jellyfin, or Google credentials. Browser checks cover 320px reflow, desktop layouts, reduced motion, keyboard navigation, and automated WCAG checks. The 200% check uses equivalent viewport reflow rather than native browser zoom.

Server records contain schema-validated JSON documents by kind, with explicit revisions. Household writes take a shared database row lock, validate cross-record rules, and increment the household revision in the same transaction. PostgreSQL is the source of truth. The browser has no persistent mutation queue or local-storage data store.

Before an upgrade, take a backup. Replace source, run `docker compose build`, then `docker compose up -d`. The migration job must complete before the app or worker starts. Check `docker compose ps`, `/api/health`, and `docker compose logs --tail=100 web worker migrate`.
