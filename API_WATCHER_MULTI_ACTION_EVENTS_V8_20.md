# API Watcher v8.20 — Multi-Action Event Actions

## Scope

`Event Action — New Record` and `Event Action — Modified Record` now support three provider-neutral step types:

- API
- Browser RPA
- Service Bus

Definitions saved before v8.20 remain compatible. When an event action has no `type`, the runtime treats it as `api`.

## Runtime context and templates

All event action types use the same API Watcher runtime context after enrichment has completed. This includes source fields, enrichment outputs and system values such as:

- `{{source.<field>}}`
- `{{steps.<stepKey>...}}`
- `{{sourceRecordId}}`
- `{{targetRecordId}}`
- `{{eventType}}`
- `{{watcherId}}`
- `{{checkpoint}}`
- `{{uuid}}`
- `{{timestamp}}`

Browser RPA supports template insertion into its template-capable fields including URL, selector, frame selector, value, key, attribute name, file path and file name. The Available Fields panel inserts into the currently focused Browser RPA field.

Service Bus supports template insertion into destination, subscription, message ID, correlation ID, content type, body and application properties. Connection selection remains tenant-aware and is not templated because it is a controlled platform resource.

## Execution model

For each changed record:

1. Execute enabled enrichment steps sequentially.
2. Build the final runtime context containing source + enrichment outputs.
3. Execute the configured NEW or MODIFIED event action as API, Browser RPA or Service Bus.
4. Persist the source record state only after the event action succeeds.
5. On failure, retain recoverability and apply the configured retry policy.

A Browser RPA event action reuses the same isolated browser session created for that record's enrichment chain. This allows an enrichment browser step to open/login/navigate and the final event action to continue in the same session.

## Performance and reliability

Existing watcher controls remain applicable:

- Max Records / Run
- Concurrent Records
- API Request Timeout
- Retry Count
- Checkpoint Overlap
- Max Enrichment Steps

The following controls now apply to both enrichment and final event actions:

- Browser RPA Action Timeout
- Service Bus Action Timeout

Service Bus send and DLQ-check calls are protected by the configured timeout. Record concurrency remains bounded, while steps inside a single record remain sequential to preserve dependencies and browser session state.

## Multi-tenant behavior

Service Bus connections are resolved server-side and must be either global/legacy connections or belong to the watcher's organization. Connection strings remain server-side and are not exposed through the watcher definition or template context.

## Monitoring

Event action logs distinguish execution types:

- `EVENT_API`
- `EVENT_BROWSER`
- `EVENT_MESSAGE`

Existing enrichment log types remain unchanged.

## Source hygiene

Stale generated `.jsx` copies of the TypeScript API Watcher designer and shared WorkflowPanel were removed. The project uses `noEmit` TypeScript source as the canonical implementation; keeping generated JavaScript siblings beside `.tsx` can cause extensionless bundler resolution to select stale runtime code.
