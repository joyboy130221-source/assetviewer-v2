# Maximo Asset Viewer — React + Vite + TypeScript

This is the migrated version of the original plain-JavaScript Maximo Asset Viewer. The Vercel serverless API (`api/`) and shared backend libraries (`lib/`) are intentionally preserved to reduce migration risk, while the browser UI is now React + TypeScript.

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

- `/` — Asset Viewer (`?env=demo-coh&assetId=V6-0401`)
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
