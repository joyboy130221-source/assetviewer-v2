# Application Architecture

## Serverless entry points

The application intentionally exposes only three files under `api/` because Vercel treats each API entry file as a Serverless Function:

- `api/auth.js` — login, logout and current-session operations.
- `api/admin.js` — environments, roles, users and API request logs.
- `api/maximo.js` — asset, work-order and worklog operations.

Each entry point is a thin router. Business logic is kept outside `api/` under `server/controllers/`, so reducing the function count does not create large monolithic files.

## Backend structure

- `server/controllers/auth/` — authentication request handlers.
- `server/controllers/admin/` — administration request handlers.
- `server/controllers/maximo/` — Maximo integration request handlers.
- `lib/` — shared database, authentication, Maximo and API logging infrastructure.

## Frontend structure

- `src/pages/` — route-level screens.
- `src/pages/admin/` — administration screens.
- `src/components/` — reusable layout and UI components.
- `src/services/` — HTTP/API client utilities.
- `src/types/` — shared TypeScript types.
- `src/utils/` — formatting and utility functions.

## API routing convention

The frontend calls consolidated endpoints using an `action` query parameter, for example:

- `/api/auth?action=login`
- `/api/admin?action=users`
- `/api/maximo?action=asset&env=demo-coh&assetId=V6-0401`

This structure reduces the Vercel Serverless Function count from 12 to 3 while preserving separation of concerns in the source tree.
