# BIB Form Builder v7

Added: Conditional Logic, Advanced Validation, Authentication Profiles, Advanced Debugger, Template Functions, Response Actions, and Role Management permissions for Form Builder and Authentication Profiles.

Credentials are encrypted using CREDENTIAL_ENCRYPTION_KEY and injected server-side. Debug output redacts authentication headers.

Template examples: `{{assetId}}`, `{{uppercase(username)}}`, `{{default(siteid, "BEDFORD")}}`, `{{now()}}`, `{{date(reportDate, "yyyy-MM-dd")}}`, `{{response.wonum}}`.

Next recommended phase after stabilization: Multi-Step API Workflows.

## 2026-09-19 update
- Response Action `Action` selector now uses the same styled select/combobox treatment as API Method selectors.
- Integrated Form Data Source now supports Authentication Profiles independently from the Submission API Action.
- The selected source authentication profile is persisted in `sourceAction.authProfileId` and is applied server-side for both Test Request and published-form data loading.
