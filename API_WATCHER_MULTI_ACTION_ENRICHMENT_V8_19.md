# API Watcher v8.19 — Multi-Action Enrichment Chain

## Scope

The API Watcher Enrichment / Pre-Action Chain now supports three step types:

- API
- Browser RPA (Playwright)
- Service Bus (Azure Service Bus Send Message / DLQ Check)

Existing watcher definitions remain backward compatible. An enrichment step without a `type` is treated as `api`.

## Runtime context and templates

All step types execute against the same per-record runtime context:

- `{{source.<field>}}`
- `{{sourceRecordId}}`
- `{{targetRecordId}}`
- `{{eventType}}`
- `{{watcherId}}`
- `{{checkpoint}}`
- `{{uuid}}`
- `{{timestamp}}`
- outputs from prior steps via `{{steps.<stepKey>...}}`

Browser RPA supports templates in URL and string action parameters including selector, frame selector, value, key, attribute name, file path and file name.

Service Bus supports templates in destination, subscription, message/correlation IDs, content type, body and application properties. The Available Fields panel inserts templates into the active supported field.

## Execution behavior

Records continue to use bounded concurrency. Steps within one record remain sequential so later steps can safely consume prior-step output. Browser steps for a record share one isolated Playwright session and the session is closed after the enrichment chain. Service Bus sends use a stable fallback Message ID per execution/record/step to improve retry traceability and duplicate-detection behavior where Azure Service Bus duplicate detection is enabled.

Step outputs are exposed to later steps:

- Browser: `steps.<key>.value`, `.url`, `.title`, `.fileName` as applicable.
- Service Bus: `steps.<key>.messageId`, `.correlationId`, `.status` as applicable.
- API: response payload as before.

## Performance configuration

The watcher Performance & Reliability section now includes:

- Browser RPA Step Timeout (default 30,000 ms; runtime bounded to 1,000–120,000 ms)
- Service Bus Step Timeout (default 60,000 ms; runtime bounded to 1,000–600,000 ms)

Existing controls remain in effect: polling interval, max records/run, record concurrency, API timeout, retry count, checkpoint overlap and max enrichment steps.

Browser sessions are created only for records that enter the action pipeline and are closed deterministically. Browser operations remain sequential inside a record because UI actions depend on browser state.

## Tenant and security behavior

API Watchers remain organization-owned. Service Bus connections now have an additive nullable `organization_id`. Legacy connections remain global (`NULL`) for backward compatibility; tenant-owned connections are accepted only when their organization matches the watcher organization.

Connection strings are resolved/decrypted only on the server. They are never included in watcher definitions or step logs. Existing header redaction and step monitoring remain in place.

## Monitoring

Browser and Service Bus enrichment steps are written to API Watcher step logs with distinct step types:

- `ENRICHMENT_API`
- `ENRICHMENT_BROWSER`
- `ENRICHMENT_MESSAGE`

This preserves the existing execution trace while making mixed integration chains diagnosable.
