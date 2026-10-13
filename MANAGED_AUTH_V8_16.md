# BIB v8.16 — Managed Token Request Configuration

Managed Bearer Token authentication profiles now expose OAuth `grant_type` and `scope` directly.

## Token request
For body-based client authentication BIB sends `application/x-www-form-urlencoded` with:
- `grant_type` (default `client_credentials`)
- `client_id`
- `client_secret`
- `scope` when configured
- `audience` when configured

HTTP Basic client authentication remains backward compatible: client credentials are sent in the Authorization header while grant type/scope/audience remain form parameters.

## Test Token
The Authentication Profile editor can test the current unsaved configuration. The test:
- does not save the profile;
- does not populate the managed token cache;
- never returns the access token or client secret to the browser;
- reports HTTP status, request duration, resolved expiry and non-sensitive response field names;
- can reuse the stored encrypted client secret while editing an existing profile.

## Performance controls
`Token Request Timeout` and `Refresh Before Expiry` remain configurable. Runtime token acquisition still reuses the encrypted token cache and deduplicates concurrent refreshes in-process. Existing 401 refresh/retry behavior remains unchanged.
