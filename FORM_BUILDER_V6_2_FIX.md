# Form Builder v6.2 - PostgreSQL Save Fix

## Fixed

The form update query previously reused PostgreSQL parameter `$5` both as the value assigned to the `status` VARCHAR column and in a CASE comparison. PostgreSQL could infer incompatible parameter types and return:

`inconsistent types deduced for parameter $5`

The form persistence queries now use explicit PostgreSQL casts for UUID, VARCHAR, TEXT, JSONB, and BIGINT parameters. The published-date CASE expression also explicitly treats the status parameter as VARCHAR.

## Maintainability improvements

Form database access has been moved from the HTTP handler into `server/repositories/form-repository.js`. The route now focuses on authentication, request validation, mapping, and HTTP responses. Field-name uniqueness is validated on both create and update operations.

No database migration is required for this fix.
