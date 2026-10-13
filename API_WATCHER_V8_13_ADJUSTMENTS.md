# API Watcher v8.13 adjustments

## Designer consistency
API Watcher controls now use the same enterprise control sizing, borders, typography, focus treatment and spacing used by the existing Form Builder/admin screens. Searchable field selectors retain type-ahead behavior while using the shared visual language.

## Monitoring navigation
API Watcher Monitoring is now a dedicated entry under **Monitoring**. It is no longer embedded in the API Watcher designer. The monitoring page can search/select a watcher, inspect executions, and drill into formatted request/response traces.

## Start / Stop
Each API Watcher list card provides Start and Stop controls. Start schedules the watcher immediately; Stop disables future scheduled executions. An already-running execution is allowed to finish safely.

## Clear Cache / replay testing
Each watcher card provides **Clear Cache**. The operation:
- deletes successful record-state/correlation cache for that watcher;
- resets its checkpoint to the Unix epoch so previously visible source records can be returned again when checkpoint filtering is used;
- retains execution and step monitoring history;
- refuses to clear while the watcher is actively executing, preventing state races.

This action is intended for controlled testing/replay. For high-volume production sources, administrators should consider the source API load before replaying historical records.

## Performance controls retained
Polling interval, max records per run, concurrent records, API timeout, retry count, checkpoint overlap and max enrichment steps remain configurable. PostgreSQL advisory locking prevents overlapping runs, state lookup is batched, and record chains use bounded concurrency while enrichment steps remain sequential per record.
