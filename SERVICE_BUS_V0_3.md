# Service Bus v0.3 — Message Explorer & Runtime Monitoring

Adds runtime queue counters, topic subscription discovery/counters, non-destructive active-message peek and DLQ browsing, plus a Copy button for Message Body in Service Bus Logs.

## Runtime monitoring
- Queue entity count remains the number of queues.
- Each queue shows Active, Scheduled and Dead Letter message counts.
- Queue configuration includes status, lock duration, max delivery count, TTL and session requirement.
- Topic selection loads subscriptions and their Active, Dead Letter and Total counts.
- Active-message browsing uses Peek and does not consume messages.
- DLQ browsing also uses Peek and is non-destructive.

## Service Bus Logs
- Message Body now has a Copy button using the browser clipboard API.

## Safety
v0.3 is intentionally read-only for message exploration. It does not Complete, Abandon, Delete, Receive-and-delete or Resubmit messages.
