# Service Bus Logging v0.1.5

Adds persistent Service Bus send logging under **Monitoring > Service Bus Logs**.

Logged fields include source (MANUAL/WORKFLOW), connection, destination type/name, message/correlation IDs, format/content type, application properties, message body, success/failure, duration, error, and workflow execution ID.

Security: application properties are redacted for common credential/token keys. Connection strings are never logged. Existing `CREDENTIAL_ENCRYPTION_KEY` must be retained.

The database table and indexes are created automatically by the existing startup schema initialization.
