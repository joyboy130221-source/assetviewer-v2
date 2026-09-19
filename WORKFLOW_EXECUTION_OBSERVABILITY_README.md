# Workflow Execution Observability Enhancement

## Included changes

1. Available Fields now insert a selected template into the last active API editor cursor. Supported targets include endpoint URL, header values, query parameter values, and JSON request body fields in both single API actions and multi-step workflow actions. Clipboard copy remains as a fallback.
2. Each multi-step submission now receives a `workflowExecutionId`.
3. Workflow results include overall status and duration plus step-level HTTP status, duration, resolved request, API response, and error details.
4. Sensitive request headers such as Authorization, API keys, tokens, secrets, and password headers are redacted from execution details and action logs.
5. The public form completion screen shows expandable workflow execution details for successful and failed workflow runs.

## Notes

- Existing single-API forms remain compatible.
- No database migration is required for this enhancement. Existing `form_action_logs` continue to store each API call; the execution summary is returned with the submission response.
- For production-grade historical workflow grouping in Monitoring, a future schema migration can persist `workflowExecutionId` as a dedicated column/table.
