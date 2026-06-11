# Headless Content Platform — Demo Guide

Demonstrates the future Web 3.0 content architecture: **authoring in a headless CMS
(Contentful)** delivered across **every surface** by the platform — a public marketing
site, an in-platform document library (DMS), the customer Document Café, and LMS training.

> **Story in one line:** *Contentful manages authoring. Web 3.0 manages consumption.*

---

## The two experiences

1. **Public marketing site** (pre-login) — `/`
   - Its own site chrome (top nav, footer), authored entirely in Contentful.
   - Home (hero + metrics + solutions + "What's new"), solution pages (`/solutions/:slug`),
     news (`/whats-new`).
   - A **Customer Portal / Sign in** button leads into the platform.

2. **Post-login platform** (the app) — sign in → Document Café, LMS, and the
   **Content Platform** module (`/cms-dms`):
   - **Overview** — the headless flow (one CMS → many surfaces) + live/demo status.
   - **Document Library (DMS)** — searchable, filterable, sortable catalogue with a
     document detail drawer (editable HTML vs downloadable asset, full metadata).
   - **Customer Café** — customer-owned documents grouped by customer/facility.
   - **Personalization** — entitlement simulator (State × Persona) showing metadata-driven
     visibility applied by the platform, not the CMS.
   - **Architecture** — the CMS ⇄ platform responsibility split.

---

## Configure Contentful (optional — the demo runs without it)

The app ships with rich **bundled demo content** and renders fully offline. To prove the
live headless round-trip, point it at a Contentful space.

`frontend/.env.local`:

```
VITE_CONTENTFUL_SPACE_ID=xxxx
VITE_CONTENTFUL_DELIVERY_TOKEN=xxxx          # Content Delivery API token (read)
VITE_CONTENTFUL_ENVIRONMENT=master           # optional, defaults to master

CONTENTFUL_SPACE_ID=xxxx                      # for the setup script
CONTENTFUL_MANAGEMENT_TOKEN=xxxx              # Content Management API token (write)
CONTENTFUL_ENVIRONMENT=master
```

## Seed the CMS (idempotent)

```
cd frontend
npm run setup-contentful
```

Creates/updates the `marketingPage`, `document`, and `newsArticle` content types and
publishes the full content set (4 marketing pages, 8 documents, 4 news articles).
Safe to run repeatedly — it updates existing models/entries rather than duplicating.

> **Live vs demo behavior:** each content getter prefers the live space but falls back to
> the bundled set whenever the live space is unreachable **or sparser than the demo** — so
> the demo is always complete. Once `setup-contentful` has published the full set, every
> surface flips to live automatically.

## Run

```
docker compose up        # backend + db + frontend (app)
# or, frontend only:
cd frontend && npm run dev
```

Open the app root `/` → the marketing site.

---

## Suggested demo flow (≈8 min)

1. **Land on the public site** (`/`). Point out the ribbon: *authored in Contentful,
   rendered by Web 3.0*. Scroll the Contentful-authored hero, solutions, and "What's new".
2. **Open a solution page** (e.g. Document Café). Highlight the **Page metadata** panel —
   audience/state metadata that controls delivery.
3. **Edit in Contentful → refresh** (if live): change a hero title in Contentful, reload the
   page, show it update — the headless round-trip.
4. **Click Customer Portal → sign in.** You're now in the platform.
5. **Content Platform → Overview**: the one-CMS-to-many-surfaces flow; click *View the
   public marketing site* to tie both experiences together.
6. **Document Library (DMS)**: filter by type/owner/state/module, open a document to show the
   detail drawer (editable HTML vs downloadable asset, full metadata, "Open in Document Café").
7. **Personalization**: switch State × Persona; show items appear/withheld by the platform
   (the CMS applies no permissions).
8. **Architecture**: close on *Contentful manages authoring; Web 3.0 manages consumption.*
9. **(Tie-in)** Document Café + LMS: the same Café policy powers training — authoring,
   lineage, and versioning carry into the learning flow.

---

## Where the code lives

- Public site: `frontend/src/marketing/{MarketingLayout,MarketingHome,MarketingSolution,MarketingNews}.tsx`
- In-app module: `frontend/src/modules/cms-dms/CmsDmsShowcasePage.tsx` + `sections/*`
- Content service (live + fallback): `frontend/src/services/contentful/{contentfulClient,contentfulService}.ts`
- CMS seeding: `scripts/setup-contentful.ts` (`npm run setup-contentful`)
- Routing: `frontend/src/App.tsx` (marketing at `/`, login at `/login`)
