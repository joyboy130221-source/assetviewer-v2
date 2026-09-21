# BIB v8.10 — Soft Delete Foundation

## Scope
Soft delete is applied to configuration/master entities:
- Organizations / tenants
- Users
- Roles
- Maximo environments
- Authentication profiles
- External views
- Service Bus connections
- Form definitions
- Analytics definitions

Historical/transaction data (submissions, API logs, workflow executions, message bus logs and action logs) is retained and is not soft-deleted by normal configuration delete operations.

## Data lifecycle
Each soft-deletable table has nullable `deleted_at TIMESTAMPTZ` and `deleted_by BIGINT` columns. Existing rows remain active because both columns default to `NULL`.

Normal reads and execution lookups exclude `deleted_at IS NOT NULL`. Delete endpoints update the lifecycle columns instead of physically deleting rows. User, role and connection deletes also set `active=FALSE` where appropriate.

## Dependency safety
Organization deletion is blocked while active Forms, Analytics definitions, or External Views still reference the tenant. Role deletion is blocked while active users are assigned to the role. Historical data is preserved.

## Backward compatibility
Schema changes are additive and are applied by `ensureSchema()`. Existing API response shapes and frontend delete flows are unchanged. No Recycle Bin/Audit UI is introduced in this release.

## Future extension
The `deleted_at` / `deleted_by` convention is the lifecycle standard for future BIB configuration entities. Restore and centralized Audit Trail can be added later without changing the current active-record contract.
