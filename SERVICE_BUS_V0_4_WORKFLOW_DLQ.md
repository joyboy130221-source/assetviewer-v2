# Service Bus v0.4 — Workflow DLQ Control

Adds **Check Dead Letter** as a first-class Message Bus workflow action.

Recommended flow:
1. Message Bus / Send Message (`key: sendWorkRequest`)
2. Message Bus / Check Dead Letter
   - Message ID: `{{steps.sendWorkRequest.response.messageId}}`
   - Initial Wait: 5s
   - Check Interval: 5s
   - Monitoring Window: 30s
3. REST API / POST

If the matching Message ID appears in DLQ, the step fails and stops the workflow. If it is not found during the monitoring window, the step succeeds and the next step executes. Topic checks may target one subscription or all subscriptions when left blank. Workflow Execution History records `MESSAGE:DLQ_CHECK` and its result.
