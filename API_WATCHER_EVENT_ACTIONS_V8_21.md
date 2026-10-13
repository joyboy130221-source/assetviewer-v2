# API Watcher Event Actions v8.21

## Verified end-to-end path

Both **6A · Event Action — New Record** and **6B · Event Action — Modified Record** render the same `EventEditor` and expose `API`, `Browser RPA`, and `Service Bus` action types.

- Persisted definition: `events.onNew` / `events.onModified`, with missing `type` defaulting to `api` for backward compatibility.
- UI: explicit Step Type selector in both sections.
- API validation: validates API endpoint, Browser RPA action, or Service Bus connection/destination according to selected type.
- Runtime: event type dispatches to the shared HTTP executor, shared `BrowserRpaSession`, or shared Service Bus execution helper.
- Templates: event actions receive source, enrichment-step, record/system, UUID, timestamp and checkpoint context.
- Monitoring: event steps are logged as `EVENT_API`, `EVENT_BROWSER`, or `EVENT_MESSAGE`.
- Performance: shared record concurrency/retry plus configurable API timeout, Browser RPA timeout, and Service Bus timeout. Browser sessions are closed on success and failure.

## Template context

Examples: `{{source.id}}`, `{{steps.step1.member[0].href}}`, `{{sourceRecordId}}`, `{{targetRecordId}}`, `{{eventType}}`, `{{uuid}}`, `{{timestamp}}`.

## Compatibility

Definitions saved before v8.20 without an event-action `type` continue to execute as API actions.
