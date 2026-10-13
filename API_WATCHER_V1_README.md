# BIB API Watcher V1

API Watcher V1 adds headless, tenant-aware system-to-system change monitoring.

## Runtime model

1. A one-minute scheduler heartbeat calls `/api/cron/api-watchers`.
2. Each watcher has its own `intervalSeconds`; only due watchers execute.
3. The source REST API is called with an optional checkpoint query parameter.
4. Records are identified by an administrator-selected Record ID field and Last Updated field.
5. Missing state = NEW; existing state with a newer timestamp = MODIFIED; same/older = ignored.
6. NEW and MODIFIED each have independent REST actions with headers, query parameters, authentication profile and JSON body templates.
7. State is advanced only after a successful target action. Target IDs can be captured from the create response and reused as `{{targetRecordId}}` on update.

## Performance / reliability configuration

- Polling interval: 1 minute to 1 hour presets (runtime supports 60–86400 seconds).
- Max records per run: 1–10,000.
- Controlled target concurrency: 1–20.
- HTTP timeout: 1–120 seconds.
- Retry count: 0–5 with bounded exponential backoff.
- Checkpoint overlap: 0–300 seconds to protect timestamp boundaries.
- PostgreSQL advisory locking prevents overlapping execution across app instances.
- Record state is fetched in one batch per run, avoiding N+1 state queries.
- Durable checkpoints and per-record state support deduplication and source-to-target correlation.

## Multi-tenancy

Watchers, execution history and record state are scoped to `organization_id`. A watcher cannot be created for a deleted/inactive organization. Organization deletion is blocked while watcher configuration exists.

## Scheduler deployment

`vercel.json` contains a one-minute cron heartbeat for `/api/cron/api-watchers`. Set `CRON_SECRET` in the deployment environment. The endpoint requires `Authorization: Bearer <CRON_SECRET>`.

For non-Vercel/on-premise deployment, invoke the same endpoint once per minute from the platform scheduler. The watcher-specific interval remains stored in BIB, so the heartbeat does not force every watcher to execute every minute.

## Templates

Source fields are available as nested template context, for example `{{source.IncidentId}}` and `{{source.audit.lastUpdated}}`.

BIB runtime context includes `{{sourceRecordId}}`, `{{targetRecordId}}`, `{{eventType}}`, `{{watcherId}}`, `{{uuid}}`, and `{{timestamp}}`.

## Initial synchronization

- Start monitoring from now (safe default)
- Process existing records
- Start from a specific ISO-8601 date/time

## Future extension points

The event action model is intentionally separated from change detection so Workflow, Service Bus and other action providers can be added without replacing the watcher runtime.
