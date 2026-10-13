# API Watcher V1.1

## Scope
API Watcher now supports a provider-neutral per-record enrichment chain between change detection and NEW/MODIFIED event actions.

Runtime flow:
1. Poll source API incrementally.
2. Resolve Record ID and Last Updated fields.
3. Classify each candidate as NEW, MODIFIED or unchanged from durable watcher state.
4. Execute enabled enrichment/pre-action REST steps sequentially for each changed record.
5. Expose each step response as `{{steps.<stepKey>.<path>}}` to later steps and the event action.
6. Execute NEW or MODIFIED REST action.
7. Update correlation/checkpoint state only after successful processing.

Source values are available as `{{source.<path>}}`. Runtime context also includes `{{sourceRecordId}}`, `{{targetRecordId}}`, `{{eventType}}`, `{{watcherId}}`, `{{checkpoint}}`, `{{uuid}}`, and `{{timestamp}}`.

## Monitoring
`api_watcher_step_logs` captures SOURCE, ENRICHMENT and EVENT_ACTION traces including sanitized headers, query parameters, request body, response body/status, duration and errors. Authorization/token-like headers are redacted. The Monitoring page formats JSON and XML/text payloads for debugging.

## Performance
Configuration includes polling interval, max records/run, concurrent records, timeout, retries, checkpoint overlap and maximum enrichment steps. Record state is batch-loaded, record concurrency is bounded, enrichment steps remain sequential within a record, and PostgreSQL advisory locking prevents overlapping runs across instances.

## Backward compatibility
Existing V1 watcher definitions remain valid. `enrichmentSteps` is optional and defaults to an empty chain. Existing JSON REST action bodies continue to work. XML/text body support is additive.
