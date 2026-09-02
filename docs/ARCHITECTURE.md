# Architecture

> **Governing principle.** This repository contains a *generic virtual-tour
> engine*. The Roman Theatre of Jableh is seed data that the engine renders —
> it is not a feature. No file in `src/` may reference Jableh, and no code path
> may branch on a specific destination. If a behaviour is needed for Jableh, it
> is modelled as data or as a registered capability.

---

## 1. System overview

```
                          ┌──────────────────────────────┐
   Visitor (any device) ──►│  Visitor experience (RSC)    │
                          │  /[locale]/…                 │
                          └──────────┬───────────────────┘
                                     │ tour manifest (JSON, cached)
                          ┌──────────▼───────────────────┐
   Administrator ────────►│  Admin console (RSC + forms) │
                          │  /[locale]/admin/…           │
                          └──────────┬───────────────────┘
                                     │
                       ┌─────────────▼──────────────┐
                       │  HTTP layer (thin)         │  route handlers,
                       │  src/app/api/**            │  server actions
                       └─────────────┬──────────────┘
                                     │  validated DTOs only
                       ┌─────────────▼──────────────┐
                       │  Domain services           │  business rules,
                       │  src/server/domain/**      │  authorization
                       └─────────────┬──────────────┘
                                     │
             ┌───────────────┬───────┴────────┬──────────────────┐
             ▼               ▼                ▼                  ▼
      ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌───────────────┐
      │ Repositories│  │  Media     │  │  Auth /      │  │  Analytics    │
      │ (Drizzle)   │  │  service   │  │  sessions    │  │  ingest       │
      └──────┬──────┘  └─────┬──────┘  └──────┬───────┘  └───────┬───────┘
             │               │                │                  │
        ┌────▼─────┐   ┌─────▼──────┐         │             ┌────▼─────┐
        │ Postgres │   │ Storage    │◄────────┘             │ Postgres │
        │          │   │ driver     │                       │ (events) │
        └──────────┘   │ local │ s3 │                       └──────────┘
                       └────────────┘
```

**Dependency rule.** Arrows point one way only. HTTP may import domain; domain
may import repositories, media, auth; repositories import the database. Nothing
lower ever imports something higher. A route handler that contains an `if` about
business rules is a bug.

---

## 2. Technology decisions

| Concern | Decision | Rationale | Rejected |
|---|---|---|---|
| Framework | Next.js 15 App Router, React 19, TS `strict` | Tourism content must be server-rendered and indexable; RSC keeps visitor JS tiny; one deploy artifact instead of two | SPA + separate API (worse SEO, two deploys, duplicated auth) |
| Database | PostgreSQL 15+ | Relational integrity is the point: scene graphs, translations, ordering, FK cascades | MongoDB (no FK guarantees for a graph), SQLite in prod |
| ORM | Drizzle ORM + generated SQL migrations | Type-safe without a query-engine binary; migrations are readable SQL we own | Prisma (heavier runtime, opaque migrations) |
| Dev/test DB | **PGlite** — real Postgres compiled to WASM, in-process | Tests exercise the *same dialect and the same migrations* as production, with zero infrastructure | SQLite for dev (dialect drift), Docker-required tests (CI friction) |
| Panorama render | Hand-written WebGL equirectangular renderer (`src/lib/panorama`) | A textured sphere does not justify ~600 KB of Three.js; we need the projection matrix anyway to place DOM hotspots | Three.js, Photo Sphere Viewer (size), Marzipano (stale) |
| Hotspot UI | **DOM overlays** projected from the camera matrix | Focusable, keyboard-navigable, screen-reader-readable, CSS-styleable — canvas-drawn hotspots are none of those | Canvas-drawn hotspots |
| Auth | Argon2id + opaque server-side sessions | Instantly revocable; no token-in-JS surface | JWT in localStorage (XSS-exfiltratable, unrevocable) |
| Styling | Tailwind v4 with CSS logical properties | `padding-inline-start` gives genuine RTL rather than a mirrored LTR layout | Hand-rolled CSS, mechanical `flip` transforms |

### 2.1 Why not Three.js / WebXR

The brief warns against reaching for heavy 3D because the product is called a
"virtual tour." We follow that. The MVP experience is *panoramic photography*,
which is one textured sphere and one camera. That is ~400 lines of WebGL. WebXR,
glTF model loading and physically-based lighting are all absent because no MVP
requirement needs them. The renderer registry (§5.1) is the seam through which a
future `model3d` renderer can be added without touching the scene model.

---

## 3. Content model

### 3.1 Entity graph

```
Destination ─┬─► Tour ─┬─► Scene ─┬─► Hotspot ──► (action target)
             │         │          ├─► SceneLink  (navigation graph edge)
             │         │          └─► SceneMedia ──► MediaAsset
             │         └─► Event ──► EventScheduleItem
             ├─► PointOfInterest ─► PoiMedia ──► MediaAsset
             └─► PoiCategory

Every content entity ─► *_translations (locale-scoped text)
```

### 3.2 The translation pattern

Content rows carry **no human-readable text**. All prose lives in a sibling
`*_translations` table keyed `(entity_id, locale)`.

```
scenes                    scene_translations
├─ id                     ├─ scene_id ──┐ composite
├─ tour_id                ├─ locale   ──┘ primary key
├─ slug                   ├─ title
├─ kind                   ├─ summary
├─ position               └─ description
└─ status
```

Consequences we accept deliberately:

- Adding a language is an `INSERT`, never a migration and never a code change.
- A read for locale `ar` falls back to the tour's default locale per-field, so a
  partially translated tour degrades gracefully instead of rendering blanks.
- Queries always join translations; repositories encapsulate this so callers
  never hand-roll the fallback.

### 3.3 Publication state

Every publishable entity has `status ∈ {draft, published, archived}` plus
`published_at`. Visitor-side repositories are physically separate from admin
repositories (`repo/public.ts` vs `repo/admin.ts`) and the public ones apply the
`published` filter in the query builder, not in a caller-supplied argument. A
visitor query *cannot* be made to return a draft by passing a wrong flag.

---

## 4. Experience model

A **Tour** declares a `kind` that selects a renderer:

| `kind` | Experience | Renderer |
|---|---|---|
| `panorama` | 360° equirectangular scenes joined by hotspots | WebGL sphere |
| `image` | High-resolution flat image with clickable regions | Pan/zoom image |
| `map` | Geographic map with POI markers | Map surface |
| `story` | Sequential narrative scenes, rich media | Story stepper |
| `event` | Time-bounded festival/exhibition experience | Any of the above + event chrome |

All five share one `Scene` abstraction. The scene row carries renderer-agnostic
fields (identity, ordering, status, media, navigation) plus a `view` JSON column
holding renderer-specific camera state (`yaw`/`pitch`/`fov` for panorama,
`zoom`/`center` for image, `bounds` for map). The JSON is validated by a Zod
schema chosen by the renderer — it is typed at the edge, not `any` in the core.

---

## 5. Extensibility seams

The brief asks for extension without rebuilding. There are exactly three
registries, and each is the *only* place a new capability is wired.

### 5.1 Renderer registry — `src/lib/tour/renderers.ts`

```ts
interface SceneRenderer<V> {
  kind: TourKind;
  viewSchema: ZodSchema<V>;      // validates Scene.view
  Component: ComponentType<SceneRendererProps<V>>;
  preload(scene: SceneDTO): PreloadHint[];
}
```

Adding a `model3d` experience = one file + one registry entry. No change to the
scene model, the admin, or the API.

### 5.2 Hotspot action registry — `src/lib/tour/actions.ts`

A hotspot stores `action_type` and a validated `action_payload` JSON blob.
Dispatch is a table lookup, never a `switch` that grows:

```ts
registerAction('navigate', { schema: …, run: (payload, ctx) => ctx.goToScene(payload.sceneId) });
registerAction('poi',      { schema: …, run: (payload, ctx) => ctx.openPoi(payload.poiId) });
registerAction('gallery',  …);  // image | gallery | video | audio | event | link
```

Both the admin editor's form fields and the viewer's behaviour are derived from
the same registry entry, so they can never disagree.

### 5.3 Storage driver registry — `src/server/media/storage/index.ts`

```ts
interface StorageDriver {
  put(key: string, body: Buffer | Readable, meta: ObjectMeta): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string | null;   // null ⇒ must be proxied
}
```

`local` ships today; `s3` is a drop-in. **Media bytes never enter Postgres** —
the database stores metadata and a storage key only.

---

## 6. Media architecture

Upload path, in order — each step can reject:

1. **Size gate** — refused above `MAX_UPLOAD_BYTES` while streaming, before the
   whole body is buffered.
2. **Magic-byte sniff** — the real container is read from the first bytes. The
   client-supplied `Content-Type` and filename extension are *evidence, not
   truth*, and disagreement is a rejection.
3. **Decode bomb guard** — `MAX_IMAGE_PIXELS` caps width × height before decode,
   defeating small files that expand to gigabytes.
4. **Re-encode** — images are decoded and re-encoded by `sharp`, which discards
   EXIF (including GPS), strips embedded thumbnails, and destroys any polyglot
   payload hiding after the image data.
5. **Generated key** — the stored name is `{uuid}/{variant}.{ext}`. The original
   filename is retained only as a display label, never as a path component.
6. **Derivatives** — thumbnail, preview (blurred, ~32 px wide, inlined for
   instant paint), and responsive widths in AVIF/WebP.

Storage root is outside the web root and served by a route handler that sets
`Content-Type` from *our* metadata and `Content-Disposition: attachment` for any
non-renderable type. Nothing under the storage root is ever executed.

Panorama specifics: equirectangular sources are validated for a 2:1 aspect
ratio, capped at 8192 × 4096 for the base texture (the WebGL `MAX_TEXTURE_SIZE`
floor across mobile GPUs is 4096, so a half-res variant is always produced), and
paired with a tiny blurred preview so a scene paints in under a second and
sharpens as the full texture arrives.

---

## 7. Localization

Two distinct concerns, deliberately not merged:

| | Content translations | UI strings |
|---|---|---|
| Lives in | `*_translations` tables | `src/lib/i18n/messages/*.json` |
| Edited by | Content editors, in the admin | Developers, in the repo |
| Added by | `INSERT` | New JSON file + locale registration |

Routing is `/[locale]/…` with `ar` and `en` shipping. `<html lang dir>` is set
from the locale's registered direction. Layout uses logical properties
throughout, so RTL is a genuine mirroring of *flow*, while directional icons
(arrows, chevrons, media transport controls) are explicitly exempted — a "next"
arrow must still point in the reading direction, and a play button must not
flip. Arabic uses a typeface stack chosen for Arabic rather than a Latin font
with fallback.

---

## 8. Security architecture

Full analysis in [`SECURITY.md`](./SECURITY.md). Structural points:

- **Sessions** — 256-bit random token, delivered in an `httpOnly`, `SameSite=Lax`,
  `Secure` cookie. Only a SHA-256 hash is stored, so a database disclosure does
  not yield usable sessions. Absolute expiry plus idle timeout, both enforced
  server-side on every request.
- **Authorization** — a single `requirePermission()` chokepoint in the domain
  layer. Roles are read from the database against the session, never from a
  request body, header, or client-supplied claim. The UI hides what a user
  cannot do; the server *rejects* it independently.
- **Ownership checks (IDOR/BOLA)** — every mutation resolves the target entity
  and verifies its destination scope before acting. Sequential IDs are never
  trusted as capability tokens.
- **CSRF** — Server Actions and mutating route handlers verify `Origin` against
  `APP_ORIGIN` and require a double-submit token; `SameSite=Lax` is defence in
  depth, not the control.
- **Rate limiting** — token bucket on login, upload, and analytics ingest, keyed
  by IP and by account, with a per-account lockout that resists username
  enumeration by keeping response timing uniform.
- **Input validation** — Zod at every boundary. Domain services accept parsed
  DTOs; they never see a raw request.

---

## 9. Analytics architecture

Privacy-first by construction:

- No cookies, no `localStorage` identifier, no cross-site anything.
- A visitor is a **daily-rotating salted hash** of (IP + User-Agent). The salt
  rotates every 24 h and old salts are discarded, so yesterday's visitors are
  mathematically uncorrelatable with today's. Raw IPs are never persisted.
- Events are an append-only table of `(occurred_at, tour_id, scene_id, type,
  locale, device_class, payload)`. `device_class` is a three-way bucket, not a
  UA string, to avoid fingerprinting.
- Ingest is `sendBeacon` to a rate-limited endpoint, batched and fire-and-forget
  so instrumentation can never slow or break the experience.
- Honours `Do Not Track` / `Sec-GPC` and a global `ANALYTICS_ENABLED=false`.

---

## 10. Performance

- Visitor pages are Server Components; the only client JavaScript is the
  renderer and its controls.
- A tour manifest is fetched once per tour and cached, so scene-to-scene
  navigation is a texture load, not a round trip.
- Textures are decoded off the main thread via `createImageBitmap`.
- Adjacent scenes (one hop in the navigation graph) are prefetched at low
  priority once the current scene is interactive — never before.
- Blurred previews are inlined into the manifest so the first paint needs no
  extra request.
- `prefers-reduced-motion` disables auto-rotation and scene-transition easing.

---

## 11. Deployment

Node runtime (not Edge — `sharp` and `argon2` are native). Managed Postgres with
automated backups. Object storage via the `s3` driver in production. Migrations
run as a release step before the new version receives traffic, and are written to
be backward-compatible with the outgoing version so a rollback is always safe.
Secrets come from the platform's secret store; `src/server/config/env.ts` refuses
to boot on a missing or default-valued secret in production.
