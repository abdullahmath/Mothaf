# Project Plan

## 1. Product vision

A platform that turns static tourism material — brochures, photo sets, signage —
into an interactive digital experience that a visitor can explore from anywhere.

The platform is **an engine, not a website**. One deployment powers many
destinations: archaeological sites, historical landmarks, museums, cultural
locations, tourism events, festivals, exhibitions, and promotional campaigns.
The Roman Theatre of Jableh is the first experience it powers, and it is
expressed entirely as seed data.

## 2. Target users

| User | Needs | Success looks like |
|---|---|---|
| **Remote visitor** | Explore a site they cannot travel to | Completes a tour, reads POIs, watches media, in their own language |
| **On-site visitor** | Context while physically present | Opens the tour on a phone, finds what they are standing in front of |
| **Researcher / student** | Structured historical detail | Reaches deep POI content and cited references quickly |
| **Content editor** | Publish without a developer | Builds a tour end-to-end in the admin, no source edits |
| **Event manager** | Promote a time-bound festival | Publishes an event with schedule and media, links it to a tour |
| **Cultural authority** | A credible public-facing product | Something that looks institutional-grade, works on any device, is accessible |

## 3. Visitor experience

The visitor should never wonder where they are or what they can touch.

1. **Discover** — destination landing page: hero, orientation, what's inside.
2. **Enter** — one unmistakable primary action.
3. **Explore** — a scene fills the viewport. Hotspots are visible but do not
   clutter. Movement is drag/swipe; navigation hotspots move between scenes.
4. **Learn** — a hotspot opens a panel with description, media, and history.
   The scene stays visible behind it; context is never lost.
5. **Orient** — a persistent minimal chrome shows scene name, a scene list, and
   an always-available way back.
6. **Switch language** — at any moment, without losing position.

Non-negotiables: usable on a mid-range phone; first meaningful paint before the
full panorama arrives; keyboard-operable; no dead ends.

## 4. Administrator experience

Reusable CRUD underneath, but the surface is built for managing *visual*
experiences: media-forward listings, live preview, drag-to-reorder scenes,
click-to-place hotspots, and a translation view that shows source and target
side by side with coverage indicators.

The gate: **an editor must be able to build a complete tour without touching
source code.**

## 5. Scope

### MVP (this release)

1. Generic tour engine — destination → tour → scene → hotspot → POI
2. Panorama and image renderers behind a renderer registry
3. Extensible hotspot action system
4. Points of interest with categories, media, and rich content
5. Media pipeline — validation, re-encode, derivatives, pluggable storage
6. Visitor experience — responsive, touch-first, accessible
7. Arabic + English with correct RTL and per-field fallback
8. Admin console — authentication, roles, CRUD across all entities
9. Events and festivals with schedules
10. Privacy-first analytics
11. Security hardening across the OWASP Top 10
12. Automated tests over data integrity, authorization, uploads, and API contracts

### Explicitly deferred

Advanced 3D / glTF, WebXR/VR, AI tour guide, voice interaction, recommendations,
collaborative editing, real-time event feeds, richer map providers, tiled
gigapixel panoramas, native apps. Each has a seam in the architecture; none is
built, because no MVP requirement needs it.

## 6. Phases

| Phase | Deliverable | State |
|---|---|---|
| 0 | Repository and environment audit | ✅ |
| 1 | Product plan and architecture | ✅ |
| 2 | Project foundation, tooling, config | ✅ |
| 3 | Database schema, migrations, domain services, auth | ✅ |
| 4 | Virtual-tour engine (renderers, actions, manifest) | ✅ |
| 5 | Visitor experience | ✅ |
| 6 | Admin console | ✅ |
| 7 | Media system | ✅ |
| 8 | Events and festivals | ✅ |
| 9 | Multilingual support | ✅ |
| 10 | Analytics | ✅ |
| 11 | Security hardening | ✅ |
| 12 | Testing and QA | ✅ |
| 13 | Performance optimization | ✅ |
| 14 | Deployment preparation | ✅ |
| 15 | Final audit | ✅ see docs/PRODUCTION-CHECKLIST.md |

## 7. Status

All 15 phases complete. `PRODUCTION-CHECKLIST.md` §8 lists the remaining
deliberate scope decisions (S3 driver, click-to-place hotspots, password
reset email, and similar).

## 8. Definition of done

A change is done when it type-checks, lints, is covered by a test that fails
without it, does not widen the attack surface without a note in `SECURITY.md`,
works in both Arabic and English, and works on a phone.
