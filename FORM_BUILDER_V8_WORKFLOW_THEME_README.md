# BIB Form Builder v8 — API Workflow & Form Themes

## New capabilities

### Multi-Step API Workflow
- Enable **Multi-Step API Workflow** in the Form Designer.
- Add, remove and reorder sequential API steps.
- Each step reuses the existing API Action configuration: method, URL, authentication profile, headers, query parameters and JSON body.
- Give every step a unique **Step key** (for example `createWO`).
- A later step can use a previous response with templates such as:
  - `{{steps.createWO.response.wonum}}`
  - `{{steps.getAsset.response.assetnum}}`
- Workflow execution is server-side and sequential.
- Execution stops on the first failed step and returns an integration error to the form.
- Every executed step is written to the existing form action log.
- Existing forms remain backward compatible: when Workflow is disabled, the existing single Submission API Action is used.
- Response Actions can use the last API response through `{{response...}}` and any workflow response through `{{steps.<stepKey>.response...}}`.

### Form Themes
Available themes:
1. Current BIB Theme
2. SAP Enterprise Theme
3. IBM Maximo Theme

A theme can be selected when creating a new form and changed later in **Form Properties**. The selected theme is applied to public forms and preview screens. Existing forms default to Current BIB Theme.

## Storage
Theme and workflow definitions are stored in the existing `form_definitions.settings` JSONB object, so this release does not require a database schema migration.

## Validation performed
Backend JavaScript syntax was checked with `node --check`. A full TypeScript/Vite build could not be completed in the generation environment because dependency installation did not complete within the available execution window. Run locally:

```bash
npm install
npm run build
```
