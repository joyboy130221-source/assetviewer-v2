# BIB v8.15 — Managed Authentication & Template Functions

## Managed Bearer Token
Authentication Profiles now support `Managed Bearer Token (Client Credentials)`.

Configuration:
- optional organization scope (blank = shared)
- token endpoint
- client ID / encrypted client secret
- client authentication: form body or HTTP Basic
- optional scope and audience
- access-token response path (default `access_token`)
- expiry response path in seconds (default `expires_in`)
- refresh-before-expiry window (0–3600 seconds)
- token request timeout (1–120 seconds)

Runtime behavior:
1. Consumer selects an Authentication Profile; consumer-specific token code is not required.
2. BIB reuses the encrypted PostgreSQL token cache while it remains outside the refresh window.
3. Concurrent refreshes in one runtime instance are deduplicated.
4. On expiry/near-expiry, BIB requests and caches a new token.
5. API Watcher and shared authenticated HTTP execution retry once after HTTP 401 with a forced refresh.
6. Profile edits invalidate its token cache.
7. Organization-scoped profiles cannot be consumed by another organization when the caller supplies organization context.

Secrets and access tokens are never returned by the Authentication Profiles API.

## Template functions
The central template engine supports:
- `{{trim(source.Description)}}`
- `{{truncate(source.Description, 100)}}`
- nested: `{{truncate(trim(source.Description), 100)}}`

`truncate` does not append ellipsis, so the result never exceeds the requested target-system field length.
