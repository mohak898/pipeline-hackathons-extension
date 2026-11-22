# Hackathon Pipeline Tracker (HPT)

**A shared team workspace for hackathon squads, plus a Chrome extension that fills it for you.**

The team lead (or anyone) installs the extension. As they browse Devfolio, Devpost, Unstop or any hackathon website, the hackathons they open are captured and deduplicated, then sent to the team's workspace. Everyone else uses the web dashboard (it installs as a PWA on phones) without the extension. There they can see the pipeline, register, ideate, plan projects, split tasks, chat and get reminders.

| | |
|---|---|
| **Extension** | Chrome MV3 · plain ES modules, no build step |
| **Dashboard + API** | Next.js 16 (App Router) · React 19 · Tailwind CSS v4 |
| **Storage** | Pluggable: JSON file (default) or Firestore via `firebase-admin` |
| **Auth** | No accounts. Per-workspace invite links, then an HttpOnly session cookie. The extension uses a revocable device token |
| **Reminders** | In-app action center · desktop notifications · Discord/Slack webhook · iCal feed · extension alarms |

---

## Contents

1. [What changed from v0.5 (and why)](#1-what-changed-from-v05-and-why)
2. [Features](#2-features)
3. [Architecture](#3-architecture)
4. [Repository map](#4-repository-map)
5. [Quick start (local)](#5-quick-start-local)
6. [Install the Chrome extension](#6-install-the-chrome-extension)
7. [Deploying](#7-deploying)
8. [Configuration](#8-configuration)
9. [Data model](#9-data-model)
10. [Deduplication rules](#10-deduplication-rules)
11. [Roles & permissions](#11-roles--permissions)
12. [Reminders & CTAs](#12-reminders--ctas)
13. [API reference](#13-api-reference)
14. [Testing](#14-testing)
15. [Security notes](#15-security-notes)
16. [Roadmap / ideas](#16-roadmap--ideas)
17. [Conventions for contributors (humans & AI agents)](#17-conventions-for-contributors-humans--ai-agents)

---

## 1. What changed from v0.5 (and why)

| Problem in v0.5 | Root cause | Fix in v1.0 |
|---|---|---|
| **Duplicate entries** | The "already processed" set lived in memory inside an MV3 service worker, and Chrome kills those after ~30 s idle. Firestore doc IDs hashed the *raw* URL, so `?ref=`, trailing `/`, sub-pages and `x.devfolio.co` vs `devfolio.co/hackathons/x` each made a new record. Listing pages were parsed too, and their first API object got saved under the listing URL. | A **canonical key** per hackathon (`devfolio:<slug>`, `unstop:<id>`, `web:<host/path>`…), plus a **name + date fingerprint** to merge the same event across platforms or its own site. Listing pages yield no key, so they are never captured. Parsers pick the object matching the page slug. Dedup marks live in `chrome.storage.session`. The server deduplicates again on every write. See [§10](#10-deduplication-rules). |
| **Only 3 platforms** | Content scripts matched only 3 hosts, and there was no manual entry. | Extension: **"This page" tab** and a **right-click "Add this page"** item, which work on *any* site via a generic extractor (JSON-LD → meta tags → keyword-anchored dates such as "Registrations close March 5, 2026"). Dashboard: **"Add hackathon → Fetch details"** reads any URL server-side, so teammates without the extension can add hackathons too. |
| **Broken UI** | `globals.css` had an *unlayered* `* { margin:0; padding:0 }`. In Tailwind v4, unlayered CSS beats utilities, so every `p-*`/`m-*` silently did nothing. There was also grey-on-black text (#222 on #020202), a missing `generic.png`, and cards scaling to 105% on hover. | New token-based design system in `@layer base/components`, readable contrast, dark **and** light themes, a mobile bottom-nav layout, and platform badges that fall back gracefully. |
| **Extension needed on every laptop** | Data lived in each browser, and share links were read-only snapshots. | A **workspace server** is the single source of truth. The extension is just one capture client, paired with a device token. Teammates join by invite link. |
| **Open database** | A hardcoded Firebase key with Firestore REST writes from the browser and extension. | All data access is server-side. `firestore.rules` denies all client access, and the key has been removed from the code. |

## 2. Features

**For everyone on the team (no extension needed)**
- **Home / Action Center**: a personal, ranked to-do list computed live, covering "Register for X (closes in 19h)", "Submission for Y due in 1d", tasks assigned to you, the lead's calls-to-action waiting for your ✅, and "pick an idea for Z". One-click buttons: *I've registered*, *Got it*, *Mark done*.
- **Hackathon pipeline**: a Kanban board through `Inbox → Shortlisted → Registered → Building → Submitted → Done` (drag & drop or arrows), plus list and timeline views. Search, archive, and results (won / finalist…).
- **Hackathon page**: key dates with live countdowns, custom milestones (e.g. "PPT round"), a **per-member registration checklist**, linked projects, hackathon tasks, ideas, a discussion thread and notes.
- **Ideas board**: pitch, upvote, park, then **"Build it"** promotes an idea to a project.
- **Projects**: description, repo/demo/pitch links, tech stack, members, a task board (to do / doing / done, assignee, due date) and a discussion thread.
- **Team chat**: a general channel plus "active threads" across hackathons and projects.
- **Calendar feed (.ics)**: subscribe once in Google, Apple or Outlook calendar and every deadline appears on your phone with alerts at 24h and 2h before.
- **Desktop notifications** while the dashboard is open, and **PWA install** on phones.
- **Sign in on another device** with a one-time link.

**Lead powers ("command is in the lead's hands")**
- **Calls to action**: broadcast "Everyone register on Unstop by 9 PM" to everyone or to selected people. Each person gets it in their action items, and the lead sees who acknowledged.
- **"Who's registered" matrix** across all active hackathons.
- Triage the Inbox, invite/reset invite link, promote to **co-lead** (admin), hand over leadership, remove members, issue recovery sign-in links.
- Workspace settings: Discord/Slack reminders, reminder offsets, public read-only timeline link, delete workspace.

**Chrome extension**
- Passive capture on Devfolio, Devpost and Unstop. It reads the API responses the page already loads and never calls those platforms itself.
- JSON-LD auto-capture on DoraHacks, ETHGlobal, Hack2skill and HackerEarth (only when the page looks like a hackathon).
- **"This page"** form on any website, prefilled by the generic extractor, with an *I'm registered* checkbox.
- Offline outbox: captures queue locally and sync when connected (retried every 15 min).
- Works **standalone** (local list) when no workspace is connected.
- Chrome notifications at 24h and 3h before registration, submission and end deadlines.

## 3. Architecture

```
 ┌──────────────────────── Lead's Chrome ────────────────────────┐
 │ content/network-hook.js (MAIN world, document_start)          │
 │   patches fetch/XHR → postMessage(JSON)                        │
 │ content/extractor.js (isolated) ─┐ JSON-LD + SPA URL watcher   │
 │ popup "This page" ── scripting ──┤ utils/page-collect.js       │
 │                                  ▼                             │
 │ background/service-worker.js                                   │
 │   network-rules.js (platform parsers, slug matching)           │
 │   utils/shared/canonical.js (key + fingerprint dedup)          │
 │   utils/storage.js (local store, outbox, session dedup marks)  │
 │   utils/api.js ── Bearer hpt_<device>.<secret> ──┐             │
 └──────────────────────────────────────────────────┼─────────────┘
                                                    ▼
 ┌──────────────────────── Next.js app (dashboard/) ──────────────┐
 │ app/api/[...path]/route.js → lib/server/router.js              │
 │   service.js   business rules, permissions, dedup, activity    │
 │   notify.js    Discord/Slack reminders + iCal                  │
 │   unfurl.js    server-side "read this URL" (SSRF-guarded)      │
 │   db.js        file | firestore | memory adapters              │
 │ lib/shared/    canonical.js · extract.js · model.js (pure JS,  │
 │                used by server, browser AND extension)          │
 │ app/w/[ws]/…   React UI; polls /snapshot?since=<rev> every 8s   │
 └────────────────────────────────────────────────────────────────┘
        ▲ cookie hpt_<wsId>              ▲ /api/cron/reminders (hourly)
   Teammates' browsers / phones      Vercel Cron · GitHub Actions · any cron
```

**Sync model.** The workspace document carries a `rev` that changes on every mutation. Clients poll `GET /api/w/:ws/snapshot?since=<rev>`. If nothing changed the server answers `{unchanged:true}` (one document read). Otherwise it returns the full snapshot. Team workspaces are small, so this is simpler and more robust than websockets on serverless hosts.

## 4. Repository map

```
/                              Chrome extension (load this folder unpacked)
├── manifest.json              MV3 manifest (v1.0.0)
├── background/
│   ├── service-worker.js      message router, capture pipeline, sync, alarms, context menu
│   └── network-rules.js       Devfolio/Devpost/Unstop response parsers (slug-matched)
├── content/
│   ├── network-hook.js        MAIN-world fetch/XHR tap (per-URL dedupe, resets on SPA nav)
│   └── extractor.js           JSON-LD fallback + SPA navigation watcher
├── popup/                     popup.html/css/js — Pipeline · This page · Settings tabs
├── utils/
│   ├── api.js                 workspace pairing + /api/ext/* client
│   ├── storage.js             local hackathons, outbox, session dedup marks (write-queued)
│   ├── alarm-manager.js       24h/3h deadline notifications
│   ├── page-collect.js        function injected into any page to gather title/meta/JSON-LD/text
│   └── shared/                ⚠ GENERATED copies of dashboard/lib/shared (npm run sync-shared)
├── package.json               {"type":"module"} so node tests can import extension files
├── .github/workflows/reminders.yml   optional cron that pings /api/cron/reminders
└── dashboard/                 Next.js app (UI + API)
    ├── app/
    │   ├── page.js                    landing: create workspace / join / your workspaces
    │   ├── join/[ws]/                 invite acceptance
    │   ├── login/                     one-time sign-in link redemption
    │   ├── share/[token]/             public read-only timeline
    │   ├── w/[ws]/                    workspace (layout → components/Shell.js)
    │   │   ├── page.js                Home: action center, CTAs, deadlines, matrix, activity
    │   │   ├── hackathons/            board/list/timeline  +  [hid]/ detail
    │   │   ├── projects/              list  +  [pid]/ detail
    │   │   ├── ideas/ chat/ team/ settings/
    │   └── api/[...path]/route.js     single catch-all → lib/server/router.js
    ├── components/            ui.js (primitives) · Shell · HackathonForm · Tasks · Ideas · Thread
    ├── lib/
    │   ├── shared/            canonical.js · extract.js · model.js  (pure, isomorphic)
    │   ├── server/            db.js · service.js · router.js · notify.js · unfurl.js
    │   └── client/            workspace.js (provider/polling) · format.js · hooks.js
    ├── scripts/sync-shared.mjs
    ├── tests/                 node:test suites (shared, model, api, extension, sync)
    ├── firestore.rules        deny-all (server uses admin SDK)
    ├── vercel.json            hourly cron for reminders
    └── .env.example
```

## 5. Quick start (local)

Requirements: Node 20+ (22 recommended).

```bash
cd dashboard
npm install
cp .env.example .env.local        # defaults work: file storage in ./.data
npm run dev                       # http://localhost:3000
```

1. Open http://localhost:3000, enter a team name and your name, then click **Create workspace**. You are now the **team lead**.
2. **Team → Copy link** and send it to teammates. They open it, type their name, and they're in.
3. **Settings → Chrome extension → Create connection code**, then paste it into the extension (next section).
4. Optional: **Settings → Team reminders**: paste a Discord or Slack webhook and click *Send test*.

## 6. Install the Chrome extension

1. Go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the **repository root** (the folder with `manifest.json`).
2. Click the extension icon, then **Settings**, and paste the connection code from the dashboard. The code looks like `https://your-dashboard#hpt_xxxx.yyyy`.
3. Browse hackathons. Detail pages on Devfolio, Devpost and Unstop are captured into the workspace **Inbox**. On any other site, use the popup's **This page** tab or right-click → *Add this page to hackathon pipeline*.

Without a connection the extension works locally. Once connected, local captures are uploaded and deduplicated.

> When you change `dashboard/lib/shared/*.js`, run `npm run sync-shared` in `dashboard/` to refresh the extension's copies. A test fails if they drift.

## 7. Deploying

### Option A: Vercel + Firestore (serverless)
1. Create a Firebase project and enable Firestore (Native mode). Deploy `dashboard/firestore.rules`. All client access is denied, and the server uses the admin SDK.
2. Create a **service account** key (Project settings → Service accounts → Generate key).
3. Import the repo into Vercel with **Root Directory = `dashboard`**, and set these env vars:
   `STORAGE=firestore`, `FIREBASE_SERVICE_ACCOUNT=<the JSON on one line>`, `CRON_SECRET=<random>`, `PUBLIC_BASE_URL=https://<your-domain>`.
4. `vercel.json` schedules `/api/cron/reminders` hourly. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically. **On the Hobby plan crons run at most daily**, so use `.github/workflows/reminders.yml` instead: add the `DASHBOARD_URL` and `CRON_SECRET` repo secrets.

> ⚠ Do **not** use `STORAGE=file` on Vercel. Its filesystem is ephemeral.

### Option B: any Node host (VPS, Railway, Render, Docker)
```bash
cd dashboard && npm ci && npm run build
STORAGE=file DATA_DIR=/var/lib/hpt CRON_SECRET=… PORT=3000 npm start
# cron: */30 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://host/api/cron/reminders
```
Back up `$DATA_DIR/db.json`. It holds everything.

## 8. Configuration

| Variable | Default | Purpose |
|---|---|---|
| `STORAGE` | `file` | `file`, `firestore` or `memory` (tests) |
| `DATA_DIR` | `./.data` | Location of `db.json` for the file backend |
| `FIREBASE_SERVICE_ACCOUNT` | — | Service-account JSON (or use `GOOGLE_APPLICATION_CREDENTIALS`) |
| `CRON_SECRET` | — | **Required** for `/api/cron/reminders` (it is disabled when unset) |
| `PUBLIC_BASE_URL` | request host | Absolute URL used in sign-in links, the calendar feed and pairing codes |
| `NEXT_PUBLIC_EXTENSION_LINK` | GitHub README | Target of the landing page's *Get the extension* button |

## 9. Data model

Every document has `id` and `workspaceId`. The collections are:

| Collection | Key fields |
|---|---|
| `workspaces` | `name, leaderId, rev, inviteCode, calendarKey, publicToken, settings{webhookUrl, reminderOffsets[]}` |
| `members` | `name, role (leader/admin/member), color, lastSeenAt, removed` |
| `sessions` | `memberId, secretHash` (browser cookie `hpt_<wsId>=<id>.<secret>`) |
| `loginLinks` | `memberId, secretHash, expiresAt (7d), used` (single-use) |
| `devices` | `memberId, label, secretHash, lastUsedAt, revoked` (extension tokens) |
| `hackathons` | `name, url, key, altUrls[], platform, stage, result, startTime, endTime, registrationDeadline, submissionDeadline, milestones[{id,label,at}], mode, location, prize, teamSize, tags[], notes, description, image, registrations{memberId: iso}, userEdited[], source, createdBy, archived` |
| `projects` | `name, description, hackathonId, status, repoUrl, demoUrl, pitchUrl, techStack[], memberIds[]` |
| `tasks` | `title, notes, status (todo/doing/done), projectId, hackathonId, assigneeId, dueAt, priority` |
| `ideas` | `title, body, hackathonId, status (open/picked/parked), votes[memberId], projectId` |
| `announcements` | `title, body, audience ('all' or memberIds[]), requireAck, acks{memberId: iso}, dueAt, archived` |
| `messages` | `threadType (general/hackathon/project/idea), threadId, body, authorId` |
| `activity` | `actorId, verb, targetType, targetId, summary` |
| `sentReminders` | `reminderId` (stops webhook reminders repeating) |

Secrets are stored only as SHA-256 hashes and compared in constant time.

## 10. Deduplication rules

Implemented once in `dashboard/lib/shared/canonical.js` and used by the extension, the server and the UI.

1. **Canonical key** from the URL (`canonicalKey`):
   - Devfolio `x.devfolio.co/*` and `devfolio.co/hackathons/x` → `devfolio:x`
   - Devpost `x.devpost.com/*` → `devpost:x` (`/software/*` project pages → none)
   - Unstop `…/<slug>-<id>[/register]` → `unstop:<id>`
   - Luma, DoraHacks, ETHGlobal, Hack2skill, HackerEarth have their own rules
   - Any other site → `web:<host>/<path minus /prizes,/register,/schedule,…>`
   - Listing and search pages → `null`, so the extension never captures them.
2. **Same event on different URLs** (`isSameHackathon`): identical name tokens (ignoring "hackathon", the year, punctuation) with deadlines within 3 days, **or** name similarity ≥ 0.75 with deadlines within 1 day. Two different ids on the same platform are never merged.
3. **Merge** (`mergeHackathon`): fills empty fields, keeps the original URL and stores the others in `altUrls`. It never overwrites fields a human edited (`userEdited`), never changes the stage or registrations, and a capture can only move the stage *forward*.
4. The extension also keeps per-tab dedup marks in `chrome.storage.session`. These survive service-worker restarts.

## 11. Roles & permissions

| Action | Member | Co-lead (admin) | Leader |
|---|:-:|:-:|:-:|
| View everything, chat, add/edit hackathons, ideas, projects, tasks | ✅ | ✅ | ✅ |
| Mark *own* registration · acknowledge CTAs · vote | ✅ | ✅ | ✅ |
| Delete own items | ✅ | ✅ | ✅ |
| Delete anyone's items · mark others registered | — | ✅ | ✅ |
| Post calls-to-action (announcements) | — | ✅ | ✅ |
| See/reset invite link, change roles, remove members, recovery sign-in links | — | ✅ | ✅ |
| Workspace settings (webhook, public link, rename) | — | ✅ | ✅ |
| Hand over leadership · delete workspace | — | — | ✅ |
| Pair own extension · calendar feed | ✅ | ✅ | ✅ |

Enforced server-side in `lib/server/service.js`. The UI only hides what you can't do.

## 12. Reminders & CTAs

- **Action Center** (`computeActions` in `lib/shared/model.js`) runs in the browser for each member. It ranks items as overdue → critical (<24h) → soon (<72h) → info.
- **Discord/Slack** (`dueReminders` + `lib/server/notify.js`): for hackathons in Shortlisted/Registered/Building, it posts once per offset window (default 72h, 24h, 3h) for each deadline and milestone. Registration reminders **name who hasn't registered yet**. It is triggered by `GET /api/cron/reminders` with `Authorization: Bearer $CRON_SECRET`.
- **Calendar feed**: `GET /api/cal/:ws/:calendarKey.ics`, with VALARMs at 24h and 2h before.
- **Desktop notifications**: fired by the open dashboard for critical items and new CTAs, once each.
- **Extension**: Chrome notifications at 24h and 3h before deadlines.

## 13. API reference

All endpoints live under `/api`. JSON in, JSON out.

| Method & path | Auth | Description |
|---|---|---|
| `GET /health` | — | `{ok, storage}` |
| `POST /workspaces` `{name, leaderName}` | — | Create a workspace and become its leader (sets cookie) |
| `GET /join/:ws?code=` | — | Invite preview `{name, members[]}` |
| `POST /join/:ws` `{code, name}` | — | Join (sets cookie) |
| `POST /login` `{code}` | — | Redeem a one-time sign-in link (sets cookie) |
| `GET /public/:token` | — | Public read-only timeline |
| `GET /cal/:ws/:key.ics` | key | iCalendar feed |
| `GET /cron/reminders` | Bearer `CRON_SECRET` | Send due webhook reminders |
| `GET /w/:ws/snapshot?since=rev` | cookie | Full workspace state, or `{unchanged:true}` |
| `PATCH /w/:ws/workspace` | lead | `{name?, settings?, regenerateInvite?, regenerateCalendar?, publicShare?}` |
| `DELETE /w/:ws/workspace` | leader | Delete everything |
| `POST /w/:ws/logout` | cookie | Clear the session cookie |
| `GET /w/:ws/unfurl?url=` | cookie | Read any URL and return a hackathon draft |
| `POST /w/:ws/login-link` `{memberId?}` | cookie | One-time sign-in link (self, or anyone if lead) |
| `POST /w/:ws/test-webhook` | cookie | Send a test message to the configured webhook |
| `POST /w/:ws/devices` `{label}` | cookie | Create an extension token → `{token, apiBase}` |
| `DELETE /w/:ws/devices/:id` | owner/lead | Revoke an extension |
| `PATCH/DELETE /w/:ws/members/:id` | self/lead | Rename, change role, remove or leave |
| `POST /w/:ws/hackathons` | cookie | Create **or merge** → `{hackathon, created, merged}` |
| `PATCH/DELETE /w/:ws/hackathons/:id` | cookie / creator-or-lead | Update / delete |
| `POST /w/:ws/hackathons/:id/registration` `{memberId?, registered}` | self/lead | Registration checklist |
| `POST/PATCH/DELETE /w/:ws/{projects,tasks,ideas,announcements}[/:id]` | cookie (announcements: lead) | CRUD |
| `POST /w/:ws/ideas/:id/vote` `{up}` · `/promote` | cookie | Vote · turn into a project |
| `POST /w/:ws/announcements/:id/ack` | cookie | Acknowledge a CTA |
| `POST /w/:ws/messages` `{threadType, threadId, body}` · `DELETE /messages/:id` | cookie | Chat |
| `GET /ext/ping` · `GET /ext/hackathons` · `POST /ext/hackathons {items[]}` | Bearer device token | Extension sync (CORS open) |

## 14. Testing

```bash
cd dashboard
npm test          # node:test — shared dedup/extractor, reminder engine, full API workflow,
                  #             extension parsers, shared-copy sync check
npm run lint
npm run build
```
`tests/api.test.mjs` runs a whole team scenario against the in-memory store: create, invite, a device capturing the same hackathon three ways (→ one record), manual add from a custom site, user edits surviving re-capture, permissions, announcements and acks, ideas → project → tasks, the calendar feed, sign-in links, the public link, cron auth, removal and revocation.

**Not yet covered by automated tests:** real Devfolio/Devpost/Unstop network payloads (the parsers are tested on representative JSON shapes; check them against live pages and adjust field names in `background/network-rules.js` if a platform changes its API), and the Firestore adapter (only the file and memory adapters run in CI).

## 15. Security notes

- Invite codes, session, device and sign-in secrets are random 24-byte values, stored hashed and compared in constant time. Cookies are `HttpOnly; SameSite=Lax` (`Secure` on https).
- Anyone holding the invite link can join. The lead can **reset** it any time and remove members, which revokes their sessions and extension tokens.
- `unfurl` blocks private, loopback and link-local addresses, has an 8 s timeout and reads at most 1.5 MB. It does not defend against DNS rebinding, so put the server behind an egress proxy if that matters to you.
- Webhook URLs are restricted to Discord and Slack hosts.
- There is no rate limiting yet. Add it at your edge (Vercel Firewall, Cloudflare) for public deployments.
- The extension reads only data the page already received. It never calls the platforms' APIs itself.

## 16. Roadmap / ideas

- **Real accounts (optional):** Google sign-in via Firebase Auth or Auth.js, mapped onto `members`, so access isn't tied to a browser cookie.
- **Web Push** for teammates' phones (VAPID + the existing service worker), on top of Discord and calendar.
- **Auto-detect "I registered"**: watch for the platform's registration-success API response and tick the checklist automatically.
- **Team-up / eligibility checks**: team size vs. members, student-only, location.
- **Submission checklist template** per hackathon (repo public, video ≤ 3 min, deck, README).
- **Post-mortems**: the results stage collects learnings, and a stats page shows win rate.
- **Discord bot** (two-way): `/hpt add <url>` and `/hpt deadlines`.
- **Realtime** (SSE or Firestore listeners) if polling ever feels slow.

## 17. Conventions for contributors (humans & AI agents)

- **Business rules go in `lib/server/service.js`**. `router.js` only maps HTTP to service calls. Every mutation must call `touch(ws.id)` (bumping `rev`) and usually `log(...)`.
- **Isomorphic logic goes in `lib/shared/`** with no I/O and no Node or browser globals. After editing, run `npm run sync-shared`, then `npm test`.
- **Never trust request bodies.** Add new fields to the matching `*Fields()` sanitizer.
- The dashboard targets **Next.js 16**: route `params` and `searchParams` are Promises. Read `dashboard/node_modules/next/dist/docs/` before using unfamiliar APIs (see `dashboard/AGENTS.md`).
- **Styling:** use tokens (`bg-surface`, `text-muted`, `border-line`, `text-accent`…) and component classes from `app/globals.css`. Put custom CSS in a `@layer`. Unlayered CSS overrides Tailwind utilities.
- **Extension:** no build step and no remote code (MV3). Escape every string you put into HTML, and keep `network-hook.js` defensive. It runs inside the host page, so it must never break the page.
