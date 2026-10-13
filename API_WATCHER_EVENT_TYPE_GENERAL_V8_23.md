# API Watcher v8.23 — Event Action Step Type in General

## Change
Section 1 · General now requires the user to choose the execution type for both event paths up front:
- New Record Event Action: API, Browser RPA, or Service Bus
- Modified Record Event Action: API, Browser RPA, or Service Bus

Sections 6A and 6B remain responsible for the detailed configuration of the selected action type. The selector was intentionally removed from 6A/6B to avoid two independent controls for the same persisted property.

## Backward compatibility
Existing watcher definitions that do not contain `events.onNew.type` or `events.onModified.type` continue to resolve to `api`. No data migration is required. When a user changes a type, missing configuration objects for API, Browser RPA, and Service Bus are initialized without deleting the configuration for the other types, allowing a user to switch types without losing previously entered settings.

## Runtime and tenancy
The persisted event action structure is unchanged. Existing API routes, tenant ownership, Authentication Profile handling, Service Bus tenant filtering, runtime dispatch, secret redaction, execution logging, retry semantics, and monitoring types remain unchanged.

## Performance
Existing per-watcher performance configuration continues to apply:
- Max Records / Run
- Concurrent Records
- API Timeout
- Retry Count
- Checkpoint Overlap
- Max Enrichment Steps
- Browser RPA Step / Event Timeout
- Service Bus Step / Event Timeout

No new hard-coded runtime timeout or concurrency behavior was introduced by moving the selector.
