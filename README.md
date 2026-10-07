# TriCore

TriCore is a web-based PMO and project performance platform. It covers
portfolio dashboards, WBS planning, Gantt and Kanban execution, EVM analytics,
financial claims, risks and change requests, and team RACI governance. The UI
is bilingual (Arabic RTL / English) and the backend is Supabase.

## Run locally

Any static file server works. ES modules don't load from `file://`, so serve
the folder instead of opening `index.html` directly.

```bash
npm run dev          # http://localhost:5173  (no install needed)
```

## Checks

```bash
npm install                          # eslint + playwright
npx playwright install chromium      # first time only
npm run lint                         # ESLint over hand-written JS
npm test                             # headless smoke test (Supabase stubbed)
```

## Deploy

Deploy the repository root as a static site (e.g. Vercel, Netlify,
GitHub Pages). There is no build step.

## Project structure

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the file layout, the
script load order (it matters) and how the hand-written code integrates with
the pre-compiled React bundle.

Configuration (Supabase project, storage keys) lives in
[`assets/js/config.js`](assets/js/config.js).
