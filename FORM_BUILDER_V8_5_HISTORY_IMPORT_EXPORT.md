# BIB Form Builder v8.5

## Enhancements

- Theme display names are now **Default**, **Classic ERP**, and **Carbon**. Existing internal theme keys remain unchanged for backward compatibility.
- Added persistent **Workflow Execution History** under Monitoring.
  - One workflow execution ID per multi-step submission.
  - Overall status and duration.
  - Per-step HTTP status, duration, resolved request, response, and error details.
  - Sensitive header/query/body values and sensitive URL query parameters are redacted before persistence.
- Added **Import / Export Forms and Workflows**.
  - Versioned `bib-form` JSON package (`formatVersion: 1.0`).
  - Exports form definition, fields, settings, workflow, and API actions.
  - Authentication credentials are never exported.
  - Authentication profiles are referenced by profile name and resolved against the target BIB instance during import.
  - Imported forms receive new form/field/workflow-step IDs and are created as drafts.
  - Import requires a target organization.

## Database

The application automatically creates `workflow_executions` and `workflow_step_executions` on startup through the existing schema initializer. No manual migration is required for this version.
