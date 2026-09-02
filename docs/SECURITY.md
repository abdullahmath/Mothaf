# Security

This is a public, unauthenticated-read platform with a small privileged admin
and an upload feature. That shape sets the priorities: the highest-value
targets are the **upload pipeline** (arbitrary bytes that get stored and served
back from our own origin) and the **admin session** (the keys to every
destination). Most of the effort below goes there.

Where a control is enforced, there is a test that fails if it is removed —
`tests/media/*`, `tests/auth/*`, `tests/admin/authorization.test.ts`,
`tests/tour/manifest.test.ts`. A security claim without a test is a comment.

---

## 1. Threat model

| Actor | Can do | Must not be able to |
|---|---|---|
| Anonymous visitor | Read published content, send analytics beacons | See drafts, discover which emails have accounts, reach any admin function |
| Authenticated editor | Write content, upload media | Publish (without the permission), touch another destination's content by id, escalate their own role |
| Administrator | Everything except platform settings | Modify or create a super admin |
| Attacker with a stolen session cookie | — | Retain access after the owner changes their password or is suspended |
| Attacker with a database dump | — | Recover passwords, reuse session tokens, recover visitor IP addresses, correlate a visitor across days |

Explicitly **out of scope** for this release: multi-tenant isolation between
separate organisations (the model is single-tenant with many destinations),
DDoS absorption (belongs at the edge), and virus scanning of uploaded media
(see §4.7).

---

## 2. OWASP Top 10 (2021)

### A01 — Broken access control

- Every admin operation begins with `requirePermission(...)` inside the domain
  service. The check is repeated in each function rather than hidden in a
  wrapper, so a new function without one reads as obviously wrong.
- The `(protected)` layout is **not** the boundary. It redirects unauthenticated
  browsers for convenience; a Server Action invoked directly, never rendering a
  page, is still refused by the service. Tested.
- **IDOR/BOLA.** Ids are not capability tokens. Hotspot payloads are checked
  against the set of entities in the *same tour or destination*, so typing
  another tour's scene id into the form is refused. Scene reordering and link
  editing intersect the submitted ids with rows actually owned by that tour.
- **Privilege boundaries.** `content:publish` is separate from `content:write`;
  an editor who posts `status=published` has it downgraded, not honoured. Only
  a super admin may create or modify another super admin.
- **Disclosure via 404.** A draft or nonexistent slug both return `not_found`.
  Answering "forbidden" for content that exists confirms its existence.

### A02 — Cryptographic failures

- Passwords: **Argon2id**, 19 MiB / 2 iterations / 1 lane (OWASP configuration
  2), per-hash salt.
- Session tokens: 256 bits from `randomBytes`, stored as SHA-256. A database
  disclosure yields no usable session. Plain SHA-256 is correct here — the
  input is full-entropy, so there is nothing to brute-force and no need for a
  slow KDF.
- IP addresses are never stored. Rate limiting and audit records keep an
  HMAC keyed with `SESSION_SECRET`, so a dump does not permit recovering
  addresses by hashing the IPv4 space.
- HSTS, `upgrade-insecure-requests`, and `Secure` cookies in production;
  `APP_ORIGIN` must be `https://` or the process refuses to start.

### A03 — Injection

- **SQL** — every query goes through Drizzle's parameter binding. The handful
  of raw statements (analytics aggregation, the rate-limit UPSERT) use the
  `sql` tagged template, which parameterises interpolations rather than
  concatenating them.
- **XSS** — React escapes by default and the codebase contains no
  `dangerouslySetInnerHTML`. Editor-supplied prose is rendered as text.
- **Stored XSS via links** — hotspot `link` URLs are restricted to `http(s)`;
  `javascript:`, `data:` and `vbscript:` are rejected at the schema. Tested.
- **Stored XSS via uploads** — see §4.
- **CSP** — `script-src 'self'` with no `unsafe-inline` and no `unsafe-eval` in
  production, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`.

### A04 — Insecure design

- Publishing a tour with no published scene is refused, because it would 404
  for every visitor who followed the link.
- A failed-login lockout is **temporary**. A permanent lock would convert a
  failed attack into a successful denial of service against the real owner.
- Rate-limit denial is floored at −1 token, so hammering cannot push a victim's
  account into an unbounded lockout.
- The tour manifest re-validates every hotspot payload on read and drops
  anything dangling, so a stale or hand-edited row degrades to a missing marker
  rather than a broken tour.

### A05 — Security misconfiguration

- `src/server/config/env.ts` validates the environment at boot and **refuses to
  start** in production on: a secret shorter than 32 characters, a secret still
  holding an `.env.example` placeholder, a non-https `APP_ORIGIN`, or
  `DATABASE_DRIVER=pglite`.
- `poweredByHeader: false`; no stack traces or internal messages reach a
  client — `toPublicError` replaces any 5xx message with a generic string.
- Security headers are set for every route in `next.config.ts`.

### A06 — Vulnerable and outdated components

- Small dependency surface: 9 runtime dependencies. The panorama renderer is
  hand-written specifically to avoid a large 3D dependency.
- `npm audit` is part of the release checklist.

### A07 — Identification and authentication failures

- **No user enumeration.** Unknown account, wrong password and suspended
  account return byte-identical messages, and `verifyPassword` hashes a decoy
  when there is no user so the timing does not separate the cases. Both
  properties are tested, including a timing assertion.
- Sessions are revocable server-side, with an idle timeout (8 h) and an
  absolute ceiling (30 d) checked on every request.
- Changing a password bumps `sessions_valid_from`, invalidating every existing
  session — including one an attacker may hold, and including any created
  microseconds later by an in-flight login.
- Cookies: `httpOnly`, `SameSite=Lax`, `Secure`, and the `__Host-` prefix in
  production so a sibling subdomain cannot overwrite them.

### A08 — Software and data integrity failures

- No dynamic code loading; CSP forbids `eval`.
- Uploaded bytes are never executed and never served with a client-supplied
  content type.
- Migrations are checked-in SQL, applied as an explicit release step.

### A09 — Logging and monitoring failures

- Append-only `audit_log` records privileged actions with actor, entity, hashed
  IP and timestamp. Login successes and failures are both recorded.
- Audit writes never fail the operation they describe — a gap in the log is
  better than rolling back a legitimate edit.
- Passwords never reach the log. Tested.

### A10 — Server-side request forgery

- The server makes no outbound HTTP requests on behalf of user input. There is
  no URL-fetching feature, no webhook sender, and no remote image importer.
  External links are stored and rendered as anchors for the *visitor's* browser
  to follow, never fetched server-side. `next.config.ts` declares no
  `remotePatterns`, so the image optimiser cannot be used as a fetch proxy.

---

## 3. Cross-site request forgery

Mutating requests are Server Actions, which Next.js protects with an origin
check. Two further controls are applied deliberately rather than relied upon
implicitly:

1. `assertSameOrigin()` is called explicitly at the top of every action. The
   `Origin` header is set by the browser on every cross-site POST and cannot be
   forged by page script, which makes it a genuine control rather than defence
   in depth.
2. Sign-out is a `POST`. As a `GET` it could be triggered by anything that
   prefetches links — including the browser's own prefetcher, which would sign
   people out as they hovered the menu.

`SameSite=Lax` is depth, not the control. `Lax` rather than `Strict` so that
following a link back from an external site does not appear as a signed-out
session.

---

## 4. Media upload

The most dangerous input the application accepts. Steps run in this order so
that a hostile file is turned away before it costs a decode.

### 4.1 Size, first
Refused above `MAX_UPLOAD_BYTES` before anything is parsed.

### 4.2 Format from bytes, never from claims
The container is identified by magic bytes. The filename extension and the
browser's `Content-Type` are evidence, not truth. HTML, SVG, ELF, PE and ZIP
are all rejected. **SVG is deliberately excluded** despite being an image: it
can carry `<script>`.

### 4.3 Decode-bomb guard
`limitInputPixels` caps width × height from the *header*, before rasterisation.
A 40 KB PNG can declare 60000 × 60000 and expand to gigabytes of RAM.

### 4.4 Full re-encode
Every image is decoded and re-encoded. The stored object is pixels we rendered,
so EXIF (**including GPS coordinates**, a real privacy leak on photographs
taken at a site), embedded thumbnails, colour-profile exploits and any polyglot
payload appended after the image data are gone by construction rather than by
stripping. Tested with a real appended `<script>` payload and real EXIF.

### 4.5 Generated storage keys
The path is `media/{uuid}/{variant}.{ext}`. The uploaded filename is kept only
as a display label, stripped of path separators, and never used to build a
path. `assertSafeKey` rejects traversal, absolute paths, backslashes, null
bytes and over-long keys; the local driver additionally re-resolves the
absolute path and verifies it is still inside the root, which catches symlink
and Unicode-normalisation cases a character check misses.

### 4.6 Serving
Files live outside the web root and are never mapped to a static route. The
media route sets `Content-Type` from **our database record**, plus
`X-Content-Type-Options: nosniff` and `Content-Disposition: attachment` for
anything not on a small inline-safe allowlist. A key must exist as a row —
guessing a path is not enough.

### 4.7 Known gap
Uploaded audio and video are stored as-is (transcoding needs ffmpeg, a
deployment dependency this release does not take on) and **no antivirus
scanning is performed**. For a deployment where editors are not fully trusted,
add a scanner between §4.2 and §4.4. Recorded in the production checklist.

---

## 5. Rate limiting and abuse

| Surface | Limit | Where |
|---|---|---|
| Login per IP | 10 burst, ~1 per 30 s | Postgres token bucket |
| Login per account | 5 burst, ~1 per 60 s | Postgres token bucket |
| Failed logins | Lock for 15 min after 8 | `users.locked_until` |
| Upload | 20 burst, ~1 per 6 s | Postgres token bucket |
| Password reset | 3 burst, ~1 per 5 min | Postgres token bucket |
| Analytics ingest | 60 burst, 1/s per IP | In-process |

Auth limits live in Postgres so they hold across instances — an in-process
counter would let an attacker multiply their allowance by the number of
replicas. The whole refill-and-consume is one atomic statement; Postgres takes
a row lock for the `DO UPDATE` branch, so concurrent attempts serialise.

Analytics ingest uses an in-process limiter on purpose: a database write per
beacon is the wrong trade, and analytics abuse pollutes a report rather than
breaching anything.

---

## 6. Privacy

Not a compliance checkbox — it is a design constraint, because this is a
cultural-institution site whose visitors have not agreed to anything.

- No cookies for visitors. The only cookies are the admin session and a
  language preference, both set by deliberate action.
- No cross-site identifiers, no third-party scripts, no third-party fonts
  (typefaces are self-hosted, so no visitor request reaches a font CDN).
- The analytics visitor hash is keyed with a salt that **includes the date**.
  It rotates every 24 h, so two days of rows cannot be joined into a profile —
  by us or by anyone holding the database.
- Raw IP and user-agent are never persisted; device is a three-way bucket, not
  a UA string.
- `Do Not Track` and `Sec-GPC` are honoured on the **server** as well as the
  client, so a hand-rolled request cannot bypass the opt-out.
- No analytics function returns individual events or groups by visitor across
  days. Offering a query shaped like a user profile would undermine the
  collection design.

---

## 7. Reporting

Report suspected vulnerabilities privately to the maintaining organisation's
security contact. Please do not open a public issue. Include the affected URL
or endpoint, what you observed, and the steps to reproduce.
