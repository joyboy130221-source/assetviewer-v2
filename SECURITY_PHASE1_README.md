# Security Phase 1: close the open doors

All settings are environment variables (see `.env.example`). The defaults keep today's behaviour unless a change is listed under **Behaviour changes**. When the server starts it logs a **security posture** list of the settings still running in legacy mode.

## 1. Portable runtime (no hosting-vendor dependency)
- Routes and their security policy live in one place: `server/http/route-table.js`.
- Every host runs the same `server/http/pipeline.js`: request id → security headers → rate limit → External View auth gate → handler → safe errors.
- `server/app.js` (Express) is the canonical runtime. It serves the API **and** the built pages, so it works on-premises, on a VM or in a container: `npm run build && npm start`. `npm run dev` is unchanged.
- `api/index.js` + `vercel.json` are now a thin, optional Vercel adapter. Deleting both removes Vercel without losing any control.
- The build writes the page shell as `dist/app.html` (instead of `index.html`), so no host can serve pages without the security headers.
- `server/local-server.js` now also serves the Maximo APIs (asset / work-order / worklogs), which were previously only routed on Vercel.
- The scheduler is configurable: `API_WATCHER_SCHEDULER`, `..._INTERVAL_SECONDS`, `..._BATCH_SIZE`. Any external scheduler can call `/api/cron/api-watchers` with `CRON_SECRET`.
- `PORT` is configurable (default 3001).

## 2. Embedding and security headers
- Admin, designer, monitoring and login pages: `frame-ancestors 'none'` plus `X-Frame-Options: DENY`.
- External View pages (`/`, `/work-order`, `/work-order-update`, `/forms/*`, `/analytics/*` and their legacy `.html` paths): `frame-ancestors 'self' <EMBED_ALLOWED_ORIGINS>`.
  - While `EMBED_ALLOWED_ORIGINS` is empty they stay embeddable by any site (legacy behaviour), with a warning.
- **Embed-only pages:** with `EXTERNAL_PAGES_EMBED_ONLY=true`, the Maximo External View pages (`/`, `/work-order`, `/work-order-update`) open only when embedded in a frame, or for a signed-in console user.
  - Opening the link directly in a browser returns a notice page (HTTP 403) with an administrator sign-in link.
  - Together with `EMBED_ALLOWED_ORIGINS`, only the configured host application (BIC/BECS) can show these pages.
  - Published forms and analytics, and the login and admin pages, are not affected.
  - It is off by default. `npm run dev` (Vite) does not apply it, so local development is unchanged.
  - Limit: this controls how the page opens in a browser. A direct API call with a copied key is still governed by `EXTERNAL_API_AUTH_MODE`, key revocation and the logs.
- All responses: `nosniff`, `Referrer-Policy`, `Permissions-Policy` and HSTS (on HTTPS).
- `SECURITY_CSP_MODE=report-only|enforce` adds a baseline Content-Security-Policy.

## 3. External View API authentication (Maximo asset / work order / worklogs)
- A request is accepted with an admin session, or with an **External View access key** sent in the `X-Embed-Key` header.
- **Admin › External Views › key icon** generates a secure link (`…&evk=<key>`).
  - The key is shown once and only its SHA-256 hash is stored.
  - It is scoped to the view's `env=`.
  - It is revoked by regenerating the key, using the revoke button, or deactivating the view.
- The frontend moves `evk` from the address bar into session storage and sends it as a header.
- Rollout with `EXTERNAL_API_AUTH_MODE`:
  - `off`: no checks.
  - `warn` (default): everything works; unauthenticated calls are logged.
  - `enforce`: only a session or a valid key is accepted.
- **API Logs** now show the **Caller** (user, External View or *Unauthenticated*), plus the client IP and request id. Use this to confirm that no unauthenticated calls remain before switching to `enforce`.

## 4. Sign-in hardening
- **No more hard-coded admin password.**
  - The first admin on an empty database uses `INITIAL_ADMIN_PASSWORD`, or a random password printed once to the log.
  - That admin must change it at first sign-in.
- **Accounts still using the old published default password** are forced to change it at their next sign-in.
- **Password policy:** `PASSWORD_MIN_LENGTH` (12) and `PASSWORD_MIN_CHARACTER_CLASSES` (3). The password must not contain the username, and published defaults are rejected. The policy applies when a password is set or changed.
- **Password changes:**
  - A password set by an administrator is a temporary password by default ("Change password at next sign-in").
  - Users who must change their password can only reach the change screen.
  - Changing a password ends every other session of that user.
- **Account lockout:** `AUTH_LOCKOUT_THRESHOLD` (5) failed attempts lock the account for `AUTH_LOCKOUT_MINUTES` (15).
  - Admins can unlock it in **Users** (unlock icon).
  - Every failed sign-in returns the same message, so accounts cannot be discovered.
- **Rate limits** per client IP for each route group: `RATE_LIMIT_AUTH`, `_PUBLIC`, `_EXTERNAL`, `_ADMIN`.
  - `RATE_LIMIT_STORE=postgres` shares the limits across instances (serverless or several servers).
  - `TRUST_PROXY_HOPS` must match the number of proxies in front of the app.
- **Sessions:** the signature check is constant-time, and the lifetime is configurable with `SESSION_MAX_AGE_HOURS`.

## 5. Outbound network policy (REST, Form Builder, Browser RPA)
- **One shared policy** (`server/lib/network-policy.js`) blocks:
  - loopback, private, link-local / cloud-metadata, carrier-grade NAT, benchmark, multicast and reserved addresses
  - IPv4-mapped and NAT64 forms of those addresses
- **Intranet systems** are allowed explicitly with `WORKFLOW_PRIVATE_HOST_ALLOWLIST`, e.g. `maximo.corp.local,*.intra.example.com`.
- **Browser RPA:** every request the browser makes is checked (navigations, redirects, sub-resources), not only the Open Page URL.
  - `file:` and other non-HTTP(S) URLs are blocked.
  - `WORKFLOW_RPA_NETWORK_POLICY=unrestricted` turns this off.
- **Upload File:** when `WORKFLOW_RPA_UPLOAD_ROOT` is set, files must be inside that folder (no `..` and no symlink escape).
- **Performance:** DNS answers are cached (`NETWORK_DNS_CACHE_SECONDS`).

## 6. Database TLS and connection pool
- `DATABASE_SSL_MODE`:
  - `auto`: legacy behaviour.
  - `disable`
  - `require`
  - `verify-full`: recommended. Uses the system CAs, or `DATABASE_SSL_CA` for a private CA.
- Pool settings: `DATABASE_POOL_MAX`, `DATABASE_POOL_IDLE_MS`, `DATABASE_CONNECT_TIMEOUT_MS`.

## Behaviour changes to be aware of
1. **Browser RPA can no longer open private or internal hosts, or `file:` / `data:` URLs.** Add trusted intranet hosts to `WORKFLOW_PRIVATE_HOST_ALLOWLIST`.
2. **Admin pages can no longer be embedded in iframes.** External View pages are unaffected.
3. **`/api/health` and `/api/db-health` no longer return internal error details.**
4. **`npm run preview` no longer works,** because the build has no `index.html`. Use `npm run build && npm start`.
5. **Users signing in with the old default password must change it.**

## Recommended rollout
1. Deploy and rotate the secrets that were in `.env.local`.
2. Set `EMBED_ALLOWED_ORIGINS` to the BIC/BECS origins and `EXTERNAL_PAGES_EMBED_ONLY=true`. Set `WORKFLOW_PRIVATE_HOST_ALLOWLIST` if needed.
3. Generate access keys for each External View and update the BIC/BECS links.
4. Watch **API Logs → Caller** for *Unauthenticated* calls.
5. Set `EXTERNAL_API_AUTH_MODE=enforce`, `DATABASE_SSL_MODE=verify-full` and `WORKFLOW_RPA_UPLOAD_ROOT`. Use `RATE_LIMIT_STORE=postgres` on serverless.

## Schema changes (additive)
- `app_users`: `must_change_password`, `password_changed_at`, `failed_login_count`, `locked_until`, `last_login_at`
- `external_views`: `access_key_hash`, `access_key_prefix`, `access_key_created_at`, `access_key_created_by`
- `api_request_logs`: `auth_method`, `user_id`, `external_view_id`, `client_ip`, `request_id`
- new table `rate_limit_buckets`
