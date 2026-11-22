# Working on this repo

Read `README.md` first — especially §3 Architecture, §10 Deduplication rules and
§17 Conventions. Key points:

- Root = Chrome MV3 extension (no build step). `dashboard/` = Next.js 16 app (UI + API).
- `dashboard/lib/shared/*` is the single source for dedup/extraction/reminder logic;
  `utils/shared/*` are generated copies — run `npm run sync-shared` in `dashboard/` after edits.
- Business rules + permissions: `dashboard/lib/server/service.js`. Every mutation calls `touch()`.
- Before finishing: `cd dashboard && npm test && npm run lint && npm run build`.
- Next.js 16 differs from older versions — see `dashboard/AGENTS.md`.
