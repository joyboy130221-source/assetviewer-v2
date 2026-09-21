# Service Bus v0.2 - Dead Letter Monitoring

Adds downstream dead-letter visibility to Service Bus Logs without confusing broker acceptance with consumer processing.

- Every new outbound message gets a Message ID when one was not supplied.
- Service Bus Logs now separate **Send Result** from **Delivery**.
- `Check Dead Letter Status` non-destructively peeks the queue DLQ, or all subscriptions of a topic, and correlates by Message ID (Correlation ID fallback).
- When found, the log stores `DEAD_LETTER`, subscription, reason, description, and check timestamp.
- When not found, status is `NOT_FOUND_IN_DLQ`. This deliberately does **not** claim the consumer processed the message successfully; Service Bus does not provide that guarantee to the sender.
- Existing logs without a Message ID cannot be reliably correlated and return a clear message.

Database columns are added automatically by startup schema migration.
