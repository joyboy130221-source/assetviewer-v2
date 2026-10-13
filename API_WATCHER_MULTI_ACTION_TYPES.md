# API Watcher Multi-Action Types

API Watcher enrichment steps and NEW/MODIFIED event actions now support three execution types:

- API (legacy/default)
- Browser RPA
- Service Bus

Backward compatibility: definitions without `stepType` execute as API actions.

Browser RPA steps for a single source record share one browser session and the session is closed after that record finishes. Different source records remain isolated. Service Bus definitions persist only the connection ID; the encrypted connection string is resolved server-side at execution time.

Enrichment outputs remain available as `{{steps.<stepKey>...}}` regardless of action type.
