# TCS Web 3.0 — LMS Client Demo Script

App: **http://localhost:5180**  ·  Org: *Iowa Healthcare Assoc* (Cedar Ridge, Lakeside, Memphis)

---

## How accounts work (read first)

There are **two ways** to become a persona in this demo:

| Persona | How you "log in" | Why |
|---|---|---|
| **End User** (frontline staff) | **Login screen → email → one-time code** | Real differentiated-login flow to show the client |
| **Administrator**, **DON** | Login screen → email → **any password** | Seeded accounts; password is mocked |
| **Staff Educator, Corporate Leader (VP), Customer Admin, TCS Admin/Exec, TCS Sales/CS** | **In-app "Switch persona"** (top-right avatar) | Not separate logins — flip live during the demo |

> The login is a **mock** — any password works, and any code works. The End User screen
> *displays* the real one-time code on-screen so you can show the flow end-to-end.

---

## ✅ Email-code flow — verified account

- **Email:** `david.davis7@example.com`
- **One-time code:** `CCDBB1D9`  *(shown on the login screen as "Demo code:")*
- David Davis = Activities Lead at Cedar Ridge, with rich data: 10/17 done, HIPAA v1+v2
  certificates, a video course in progress.

> Need a fresh code (or for another learner)? Two options:
> - As Staff Educator → **Learners** tab → **Resend invite code** on any learner.
> - Terminal: `curl -X POST http://localhost:8010/api/lms/learners/8/resend`
>   (8 = David; the response returns the new code, also shown on the login screen).

Other end-user emails (all at Cedar Ridge, facility 1): `linda.williams2@example.com`,
`jennifer.miller6@example.com`, `john.garcia5@example.com` … (pattern: `first.lastN@example.com`).
Generate a code for any of them via Resend before signing in.

---

# The Demo Script (≈12 min)

### Act 1 — The frontline learner (End User)  ·  *the "wow"*

1. Open **http://localhost:5180** (incognito / logged out).
2. Enter **`david.davis7@example.com`** → **Continue**.
3. Screen switches to the **one-time code** step — point out: *"frontline staff never get a
   password; they sign in with a code we email them."* The **Demo code: CCDBB1D9** is shown.
4. Enter the code → **Go to my training**.
5. Land on **My Learning** (no sidebar — learners only see their training):
   - **Journey** by program with completion %.
   - A **video course** in progress → open it → the **YouTube video plays inline**, then
     acknowledge & sign.
   - A document course → the **real PDF renders full-width** in the player.
   - **Transcript / Passport** → certificates **grouped by course**, showing **HIPAA v1 AND v2** —
     *"staff keep the certificate they earned on the version they completed."*

### Act 2 — The training owner (Staff Educator)  ·  *the control room*

1. Top-right avatar → **Switch persona → Staff Educator**.
2. Land on the **Training Center** banner (81% team complete) + **Compliance Copilot**
   (readiness score 80, prioritized insights with point-impact).
3. **Assignments** tab → **Assign training**:
   - Pick a course → due date **auto-fills from the course Type** (annual / 90-day / 30-day).
   - **Audience filter** → staff list narrows to the course's target role; toggle **Show all staff**.
4. **Course Catalog** tab → dense rows with **▶ Video / 📄 Document** indicators.
   - Open a course → **edit**, **replace document → new version** (assigned learners auto-bump;
     completers keep old certs), or add a **YouTube video**. Delete is blocked if assignments exist.
5. **Learners** tab (User Management) → upload roster, **Resend invite code**, and
   **Assign training** to one learner (same Type-due-date + Audience filter — show David: courses
   filtered to *Activities Lead*, "annual" chips, auto due dates).
6. **Training Compliance** tab → **staff × program heatmap**; tap a program to see *who's behind*;
   **Report** → surveyor-ready **PDF preview** (inline, full-width) → Download.

### Act 3 — Oversight (DON)

1. Switch persona → **DON** (or log in `mary.smith0@example.com` / any password).
2. Oversight-first view: facility readiness, overdue, behind-staff — *the clinical leader's lens*,
   feeding off the same live data. Note the **hand-off cue** pointing to the Educator.

### Act 4 — The portfolio (Corporate Leader / VP)

1. Switch persona → **Corporate Leader**.
2. **Portfolio Copilot**: facilities ranked by risk; **Memphis** flagged as the outlier.
3. **Drill into a facility** → lands inside that facility's Training Compliance — *"one click from
   board-level risk to the exact staff member who's behind."*

### Optional Act 5 — TCS internal

- Switch persona → **TCS Admin / Exec** or **TCS Sales / CS** to show the internal lens
  (Command Center / accounts view).

---

## The story arc (one sentence)

> *Code-login for the frontline → the Educator assigns by Type & Audience and tracks a live
> heatmap → the DON oversees → the VP sees portfolio risk and drills to the one person behind —
> all on one connected platform, with versioned content and surveyor-ready evidence.*

---

## Quick reset / troubleshooting

- **Restart clean:** `cd web3-platform && docker compose down -v && docker compose up -d`
  (recreates schema + reseeds; wait ~30s for the backend to finish seeding).
- **Stale facility after reseed:** the header self-repairs; if a page looks empty, re-pick the
  facility in the top-left switcher.
- **Need a code on stage:** Educator → Learners → Resend invite code (or the curl above).
