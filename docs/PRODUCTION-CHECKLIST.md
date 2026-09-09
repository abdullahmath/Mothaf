# Production checklist

Two kinds of entry appear below. **Verified** items were exercised in this
build and have a test or a recorded observation behind them. **Required before
launch** items are genuine gaps or deployment-specific steps that no amount of
code in this repository can settle. Nothing is ticked on the strength of having
been written.

---

## 1. Automated gates

Run before every release. All four must pass.

```bash
npm run verify
```

| Gate | Command | Status in this build |
|---|---|---|
| Type checking | `npm run typecheck` | ✅ clean, `strict` + `noUncheckedIndexedAccess` |
| Linting | `npm run lint` | ✅ clean |
| Tests | `npm test` | ✅ 201 passing |
| Production build | `npm run build` | ✅ 19 routes, hermetic (no network, no database) |

---

## 2. Configuration

- [ ] **`SESSION_SECRET`** — 32+ random bytes, unique to this environment.
      `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- [ ] **`ANALYTICS_SALT`** — separate value, generated the same way.
- [ ] **`APP_ORIGIN`** — the real `https://` origin. Cookies are `Secure`; the
      process refuses to start otherwise.
- [ ] **`DATABASE_URL`** — managed Postgres with TLS. `DATABASE_DRIVER=postgres`.
- [ ] **`STORAGE_DRIVER`** — `s3` for anything multi-instance. `local` only with
      a mounted persistent volume, and the app warns about this at boot.
- [ ] Secrets come from the platform's secret store, never a committed file.
- [ ] `.env.local` is git-ignored — ✅ verified, and the repository contains no
      real secret (`.env.example` holds placeholders only).

The boot-time validator in `src/server/config/env.ts` **refuses to start** in
production on a short secret, a leftover `.env.example` placeholder, a non-https
origin, or `DATABASE_DRIVER=pglite`. Treat a failed boot as the guard working.

---

## 3. Data

- [ ] `npm run db:migrate` as a release step, before new instances take traffic.
- [ ] Migrations are backward-compatible with the outgoing version, so a
      rollback never needs a down-migration.
- [ ] Automated backups enabled, and **a restore has actually been performed
      into a scratch database**. An untested backup is a hope.
- [ ] `npm run db:seed` run **once** to create the first administrator. It
      prints a generated password exactly once — store it, then change it.
- [ ] Seed placeholder content removed or replaced (see §6).

**Verified:** 30 tables with foreign keys, unique constraints, check
constraints and a partial unique index enforcing one start scene per tour.
14 schema-integrity tests assert the database rejects what the application
must never write.

---

## 4. Security

**Verified in this build** — each has a test that fails if the control is removed:

- ✅ Argon2id password hashing; no user enumeration by message or by timing
- ✅ Opaque server-side sessions; revocation, idle and absolute expiry
- ✅ Password change invalidates every existing session
- ✅ Role matrix enforced in the domain layer, not only in the UI
- ✅ Publish separated from write; a crafted `status=published` is downgraded
- ✅ Cross-tour and cross-destination references refused on write and dropped on read
- ✅ Upload: byte-level format detection, decode-bomb guard, full re-encode
      (EXIF/GPS discarded, polyglots stripped), generated paths, traversal refused
- ✅ Media served with a content type from our own record, plus `nosniff`
- ✅ `javascript:` / `data:` / `vbscript:` link URLs refused
- ✅ Rate limiting on login and upload, held in Postgres so it survives replicas
- ✅ Strict CSP, HSTS, `frame-ancestors 'none'`, `poweredByHeader` off
- ✅ Analytics carries no cookie and no stable identifier; DNT/GPC honoured server-side
- ✅ No third-party origin in the CSP and none contacted at runtime — verified
      in a browser, not merely configured

**Required before launch:**

- [ ] **Antivirus scanning of uploads.** Not implemented. Add a scanner between
      format detection and re-encode if editors are not fully trusted.
      (`docs/SECURITY.md` §4.7.)
- [ ] **Password reset delivery.** The token table, expiry and single-use
      semantics exist; no email transport is wired. Either wire one or remove
      the entry point so it cannot half-work.
- [ ] `npm audit --production` clean, or every finding triaged in writing.
- [ ] Trusted-proxy configuration verified: `x-forwarded-for` must be set by
      your proxy **and stripped from client requests**, or IP-based rate
      limiting can be evaded by sending the header.
- [ ] Penetration test or independent review of the upload path.
- [ ] Decide and document the log retention period for `audit_log` and
      `analytics_events`, and schedule pruning.

---

## 5. Performance and operations

**Verified:**

- ✅ Panorama engine is 27 KB bundled, with no 3D-library dependency
- ✅ Panorama textures capped at 4096 px wide — above that, upload fails
      silently on a large share of mobile GPUs
- ✅ Inline blurred previews ship in the manifest, so first paint costs no
      extra request
- ✅ Responsive AVIF/WebP derivatives generated at ingest
- ✅ Hotspot positioning is event-driven, not a 60 fps loop
- ✅ Immutable, year-long cache headers on media; ETag and 304 supported
- ✅ Byte-range support, so video and audio can seek
- ✅ Self-hosted typefaces with `unicode-range` subsetting preserved, so an
      Arabic reader never downloads the Cyrillic slice
- ✅ 103 kB shared JS; the tour page is 133 kB first load *including* the
      panorama engine
- ✅ Verified in-browser: a full page load makes **zero third-party requests**

**Required before launch:**

- [ ] CDN in front of `/media` — the route is correct but proxying every asset
      byte through the application server is not how this should run at scale.
- [ ] Load test the tour page with realistic panorama sizes.
- [ ] Error tracking and uptime monitoring wired.
- [ ] Scheduled jobs for `pruneExpiredSessions()` and `pruneRateLimits()`.
- [ ] Confirm `sharp` builds for the deployment architecture (it is a native
      module; an arm64 image needs arm64 binaries).

---

## 6. Content

- [ ] **Replace the seeded Jableh copy.** It is deliberately general
      scaffolding, not verified curatorial text, and `src/server/db/seed/jableh.ts`
      says so in its header. It must be reviewed and approved by the responsible
      cultural authority before that destination is published.
- [ ] **Replace the generated placeholder panoramas** with real photography.
      They are honestly abstract images that exercise the pipeline; they are not
      a depiction of the site.
- [ ] Alt text present in both languages for every published image — the media
      library flags what is missing.
- [ ] Arabic reviewed by a native speaker, especially the plural forms and the
      month names (`ar-SY` is used, giving أيلول rather than سبتمبر; change
      `LOCALE_META` for a deployment centred on another region).
- [ ] Every published tour has a published start scene — enforced, but confirm
      the intended scene is the one marked.
- [ ] Legal pages: privacy notice reflecting the analytics described in
      `SECURITY.md` §6, plus terms and accessibility statement.

---

## 7. Final verification

- ✅ `npm run build` succeeds with **no database and no network reachable**.
      Visitor pages render on request and cache at the data layer
      (`server/domain/public/cache.ts`), rather than prerendering at build, so
      the build system never needs production database credentials. Typefaces
      are vendored into `public/fonts`, so the build does not depend on Google
      Fonts being up — it failed exactly that way once before being fixed.
- [ ] `npm start` serves, and a visitor can complete a full tour.
- [ ] Verified by hand in a real browser, in both languages:
  - Home page loads, hero panorama renders and turns
  - Destination page lists tours, points of interest and events
  - Tour: scenes load, hotspots sit where they should, navigation works, POI
    panel opens, language switch preserves position
  - Admin: unauthenticated `/admin` redirects; wrong password gives the generic
    message; a correct password reaches the dashboard
  - Media: upload accepted; a non-2:1 image rejected as a panorama with a
    message naming the ratio
- [ ] Mobile: touch drag, pinch zoom, bottom-sheet panel, no horizontal scroll
- [ ] Keyboard only: skip link, focus visible everywhere, hotspots reachable by
      Tab, dialog traps focus and closes on Escape
- [ ] `prefers-reduced-motion` respected — auto-rotation and inertia stop
- [ ] Lighthouse: performance, accessibility, best practices, SEO
- [ ] No `console.log` left in shipped code paths; no debug routes
- ✅ `robots.txt` and `sitemap.xml` — both dynamic, database-backed, verified serving real URLs for every locale × published destination/tour

---

## 8. Known gaps

Recorded honestly rather than quietly omitted. None of these are load-bearing
for the MVP flows above, and all are deliberate scope decisions.

| Gap | Consequence | Notes |
|---|---|---|
| S3 storage driver is a stub | Multi-instance deploys must use a shared volume until implemented | Interface exists; it throws loudly rather than silently dropping uploads |
| Visual hotspot placement (click-to-place on the panorama) | Hotspot bearings are entered numerically | `unproject()` exists and is unit-tested, which is the hard part |
| POI category picker in the admin | An editor cannot assign a category from the UI yet | Column, read path and `listCategories`/`createCategory` all exist |
| Password reset email | Reset flow cannot complete | Token storage and expiry implemented |
| Antivirus scanning | See §4 | |
| Audio/video transcoding | Large source files served as uploaded | Needs ffmpeg |
| Map and story renderers | Only panorama and image experiences render | Registry seam exists; adding one is a file plus a registry entry |
| E2E browser tests | Visitor flows verified manually, not in CI | Unit and integration coverage is thorough; Playwright would close this |

---

## 9. Sign-off

| Area | Reviewer | Date |
|---|---|---|
| Security | | |
| Accessibility | | |
| Content and translation | | |
| Infrastructure | | |
