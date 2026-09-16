# Integration Hub — React + Vite + TypeScript

This is the migrated version of the original plain-JavaScript Integration Hub. The Vercel serverless API (`api/`) and shared backend libraries (`lib/`) are intentionally preserved to reduce migration risk, while the browser UI is now React + TypeScript.

## Architecture

- `src/pages` — route-level screens only
- `src/components` — reusable UI/layout components
- `src/services` — HTTP/API boundary and Maximo error normalization
- `src/types` — shared TypeScript domain types
- `src/utils` — pure formatting/date helpers
- `api/` — existing Vercel serverless endpoints
- `lib/` — existing PostgreSQL, auth, Maximo, and API-log backend helpers

This separation keeps business/UI code reusable if the frontend is later migrated to Next.js.

## Routes

- `/` — Integration Hub (`?env=demo-coh&assetId=V6-0401`)
- `/work-order` — Create Work Order
- `/work-order-update` — Update Work Order and Worklogs
- `/login` — Administration login
- `/admin` — Administration dashboard
- `/admin/maximo-environments`
- `/admin/api-logs`
- `/admin/roles`
- `/admin/users`

Legacy `.html` URLs are also retained for compatibility with existing BIC/BECS External View links.

## Local development

```bash
npm install
npm run vercel:dev
```

Use `vercel dev` rather than plain `vite` when you need the `/api/*` serverless endpoints locally.

For frontend-only work:

```bash
npm run dev
```

## Production build

```bash
npm install
npm run build
```

Deploy the project root to Vercel. `vercel.json` builds Vite into `dist` while keeping `/api/*` as serverless functions.

## Environment / database

Keep the same environment variables used by the original project. The backend files were preserved, so the database and Maximo configuration behavior remains compatible.

## Future Next.js migration

The React pages are intentionally separated from API services, types, utilities, and reusable components. A later Next.js migration can move routing into `app/` while retaining most components, types, and domain logic.

## v4.2.0 Administration UX
- Fixed login password visibility toggle and aligned the eye icon inside the password field.
- Added explicit Add New workflow for Maximo API Endpoint, Roles, and Users.
- Consolidated table edit/delete actions into a single horizontal action group with icons.
- Refreshed API Request Log filters, truncated long request URLs, and replaced View text with an icon action.
- Reorganized navigation into Dashboards, Setup, and Monitoring groups.


## v4.3 UI maintenance
- Sticky headers for Maximo API Endpoint, API Request Log, Roles, and Users grids.
- Confirmation copy no longer exposes the selected runtime environment on operational screens.
- Work Order Update now preserves the asset number when navigating back to Asset Viewer.
- Refined Worklog styling and right-aligned submission actions.
- Added Prettier scripts for consistent source formatting. Run `npm install`, then `npm run format` before committing UI changes.

## Vercel Hobby deployment: single API function

Version 4.5 consolidates all backend endpoints into one Vercel Serverless Function (`api/index.js`).
The individual route handlers live under `server/api/`, so Vercel does not count each handler as a separate function.
`vercel.json` rewrites `/api/*` to the single dispatcher while preserving the existing frontend API URLs.

This keeps the current API contract unchanged (for example `/api/asset`, `/api/auth/login`, and `/api/admin/users`) while reducing the deployment from 14 API functions to 1.
