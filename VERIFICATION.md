# Verification

Checked on November 20, 2026, using Node 24, local PostgreSQL 18, and Chromium.

## Passed

- Production build: `npm run build`.
- TypeScript: `npm run typecheck`, including a separate check for unused locals and parameters.
- Domain tests: `npm test`, 11 tests covering food exclusions and weighting, exhausted draws, Pacific daylight-saving changes, birthdays, occurrence exceptions, reminders, attachment signatures, and Seerr status mapping.
- Browser and API tests: `npm run test:e2e`, 15 tests against the disposable `family_e2e` database.
- Initial PostgreSQL migration and subsequent migration deployment with no pending changes.
- PostgreSQL restart persistence: accounts, attachment metadata, and attachment bytes remained intact after stopping and restarting the local database.
- Dependency audit: `npm audit --audit-level=high`, zero reported vulnerabilities.
- Application and health endpoints returned HTTP 200 during local preview.
- Authored interface and documentation scan found no em dashes or the checked promotional phrases.

The browser/API suite covers account setup, invitations, link replay, blocked public registration, owner-only settings, origin enforcement, password reset session invalidation, concurrent shopping edits, undo, server-generated food draws, visit deduplication, authenticated attachment downloads, rejected invalid files, media request deduplication, service outages, reminder deduplication, and cross-browser updates.

The suite also exercises the calendar birthday form, server upload progress flow and file removal, snapshot loading and recovery, and the sign-in form. Screenshots were inspected at desktop and 320px widths. Automated WCAG checks passed for Home, Shopping, Calendar, and Media. Keyboard skip navigation and reduced-motion behavior passed. The 200% layout check uses equivalent 320px viewport reflow from 640px, not native browser zoom.

## Not verified here

- Docker Compose execution, LXC filesystem ownership, and the public HTTPS reverse proxy. Docker is not installed in this workspace.
- The documented `pg_dump`/`pg_restore` and attachment-volume backup/restore procedure on Docker.
- Connections to your actual Seerr and Jellyfin installations. Integration tests use a local HTTP fixture.
- Google Places requests with a real billing-enabled API key.
- Manual assistive-technology testing and native browser zoom.

All test accounts, events, and media fixtures belong to the disposable test database. The household database has no demonstration content.
