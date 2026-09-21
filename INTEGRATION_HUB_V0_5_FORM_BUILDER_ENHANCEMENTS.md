# Integration Hub v0.5 — Form Builder Enhancements

## Changes

1. Standardized Organization / Tenant combobox styling.
2. Removed the redundant `Forms` title and persistence subtitle from the Form Builder Wizards list while preserving the existing right-aligned Tenant / Import / New Form action position.
3. Added searchable Tenant combobox behavior. Filtering begins after 3 typed characters; shorter input keeps the full list visible and shows a hint.
4. Added a generic Failure Response template for failed workflow execution.

## Generic Failure Response

Configure in Form Designer > Failure Response.

Available examples:

```text
{{workflow.status}}
{{workflow.error}}
{{failedStep.key}}
{{failedStep.name}}
{{failedStep.type}}
{{failedStep.error}}
{{failedStep.response.status}}
{{failedStep.response.messageId}}
{{failedStep.response.deadLetterReason}}
{{failedStep.response.deadLetterDescription}}
{{steps.stepKey.response.someValue}}
```

When any executed workflow step returns `success: false`, workflow execution stops as before. Integration Hub now renders the configured Failure Response and returns it to the public form UI. The same mechanism also covers a failed legacy/single submit API action.

Sensitive request fields are sanitized before workflow/failure template data is exposed to the public response.
