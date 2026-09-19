# Browser RPA v0.1.2

## Fixes

- Fixed the public workflow completion screen showing `ERROR` for successful Browser RPA steps whose HTTP status is intentionally null.
- Browser RPA steps now show `SUCCESS` / `FAILED` based on the step execution result.
- API steps continue to show their HTTP response status when available.
- Workflow Execution History now uses the same Browser RPA status logic.
- Browser RPA detail sections are labeled `Browser Result`; API steps remain `API Response`.

This release includes the v0.1.1 database migration that widens `workflow_step_executions.request_method` to `VARCHAR(50)`.
