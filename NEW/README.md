# TCS Web 3.0 — Consolidated POC Platform

One unified application that consolidates the scattered bid-phase demos into a single shell:
**LMS · Document Café · Survey Readiness · Compliance Dashboard · Executive Command Center**,
with Ticketing / AI Search / AI Chat / POC Advanced shown as nav stubs.

Built as a functional prototype for the Web 3.0 deep-dive discovery sessions. Demonstrates the
cross-module handoffs the decks promise:

- **Document Café publish → LMS acknowledgement** — publishing a new policy version fans out
  acknowledgement tasks + LMS training assignments to affected staff.
- **Mock Survey finding → POC → LMS auto-assign** — a CEP finding's "Create POC" drafts a Plan of
  Correction and auto-assigns the Education-step training in LMS.
- **Outcomes → Dashboard** — LMS completion + survey findings + audits roll up into the Compliance
  Dashboard (single-facility + corporate portfolio with the outlier surfaced).

## Stack

- **Backend:** FastAPI · SQLAlchemy 2.0 async · Postgres 16 · Pydantic v2 (single app, modular routers).
- **Frontend:** React 19 · Vite 7 · TypeScript · Tailwind 4 · React Router 7 · TanStack Query · Recharts.
- **LLM:** Anthropic (primary) / OpenAI (optional) via a provider abstraction, with a deterministic
  **stub fallback** so the demo runs fully offline with no API key.

## Run (one command)

```bash
cp .env.example .env        # optional: add an LLM key for live AI; leave as-is for stub mode
docker compose up --build
```

- Frontend: http://localhost:5180
- Backend API + Swagger: http://localhost:8010/docs
- Postgres: localhost:5440

The backend seeds automatically on first boot (idempotent): one 12-facility corporate org
(**Memphis Care Center** is the deliberate outlier) + 2 independent facilities, staff, an LMS catalog
with varied completion, Café documents (TCS source + customer copies with version history), two CEP
pathways (Skin & Wound, Infection Control), audit templates/runs, and seed findings at Memphis.

## Demo script

1. **Sign in** (mocked) → land on the Compliance Dashboard.
2. **Switch persona** (top-right) — DON / Administrator / Corporate Leader / Customer Admin / Staff
   Educator / End User, plus TCS Admin & TCS Sales/CS. Nav and dashboard lens change with the role.
3. **Dashboard → Portfolio** — Memphis surfaces as the readiness outlier; switch to Single facility for
   per-facility F-tags.
4. **LMS** — see assignments, mark complete, export a staff member's surveyor-evidence PDF.
5. **Document Café** — pick a customer doc → **Publish new version** → acknowledgement tasks appear, and
   matching training shows up in **LMS** under the "From Café" filter.
6. **Survey Readiness** — start a Skin & Wound mock survey → answer "No" on a citable element → a finding
   with an F-tag appears → **Create POC → assign training** drafts a POC and auto-creates LMS training
   (visible under the "From POC" filter) → download the **CMS-2567 PDF**.
7. **Command Center** (TCS Admin persona) — ARR / retention, AI cost-vs-revenue, Sales/CS morning view,
   and Search & Chat analytics.

## Layout

```
web3-platform/
├── docker-compose.yml
├── backend/   FastAPI app — app/core, app/llm, app/shared, app/modules/{lms,cafe,survey,dashboard,command_center}, app/seed
└── frontend/  React app  — src/shell, src/lib, src/components/ui, src/modules/{lms,cafe,survey,dashboard,command-center,stubs}
```

> Originals (tcs-lms-demo, tcs-latest-cep-demo, tcs-command-center, etc.) are untouched and keep running
> on their existing ports. This consolidated app uses non-clashing ports (5180 / 8010 / 5440).

## CMS / DMS Showcase: Contentful Setup

This business-demo module shows how Contentful can own CMS/DMS authoring while Web 3.0 owns consumption, identity, entitlements, search, AI, and dashboards.

1. Configure Contentful management variables before running the setup automation:

   ```bash
   export CONTENTFUL_SPACE_ID=your_space_id
   export CONTENTFUL_ENVIRONMENT=master
   export CONTENTFUL_MANAGEMENT_TOKEN=your_management_token
   ```

2. Configure frontend delivery variables in `frontend/.env.local`:

   ```bash
   VITE_CONTENTFUL_SPACE_ID=your_space_id
   VITE_CONTENTFUL_ENVIRONMENT=master
   VITE_CONTENTFUL_DELIVERY_TOKEN=your_delivery_token
   ```

3. From `frontend/`, run the idempotent setup command:

   ```bash
   npm run setup-contentful
   ```

   The command creates or updates the Marketing Page, Document, and News Article content models, creates the demo entries, publishes them, and is safe to run multiple times.

4. Start the application and navigate to **CMS / DMS Showcase** in the existing sidebar navigation.

5. Demo the tabs in order:

   - **Marketing Pages:** Contentful-authored page content rendered inside Web 3.0.
   - **Document Library:** CMS/DMS documents with type, state, audience, module, editable HTML, and downloadable asset indicators.
   - **Document Cafe:** Customer-owned documents with customer, facility, department, category, and Web 3.0 access messaging.
   - **Personalization:** State and persona selectors filter Contentful content inside the application to demonstrate future entitlement-driven visibility.
   - **Architecture:** Executive view showing that Contentful manages authoring while Web 3.0 manages consumption.

