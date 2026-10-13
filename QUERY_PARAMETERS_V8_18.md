# Ordered multi-value query parameters

BIB REST actions now store query parameters as an ordered array so repeated keys are preserved. Legacy object-shaped configurations remain accepted at runtime and are normalized when a definition is saved.

Example:

```json
[
  { "key": "$top", "value": "10" },
  { "key": "$expand", "value": "Site($select=SiteName)" },
  { "key": "$expand", "value": "Asset($select=AssetNumber,Title)" }
]
```

The HTTP layer uses append semantics and emits both `$expand` values in their configured order. Template rendering is performed per entry.

## Coverage

The shared HTTP layer is used by API Watcher, Form Builder source/submission actions, Form Builder API workflow steps, Analytics Builder and authenticated REST execution. Admin save endpoints normalize new/edited REST actions to the ordered representation while legacy records continue to execute without migration.

## Performance / safety configuration

The query parameter parser is bounded and configurable with environment variables:

- `HTTP_QUERY_MAX_ENTRIES` — maximum query entries per request; default `200`, range `1..5000`.
- `HTTP_QUERY_MAX_KEY_LENGTH` — maximum key length; default `512`, range `1..4096`.
- `HTTP_QUERY_MAX_VALUE_LENGTH` — maximum value length; default `16384`, range `1..1048576`.

Limits are enforced centrally before network execution and when supported definitions are saved. This prevents unbounded query construction while allowing deployments with larger OData queries to tune limits without code changes.
