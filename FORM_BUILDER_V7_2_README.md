# BIB Form Builder v7.2

Changes in this revision:

- Moved **Available Fields** out of **Submission API Action**. It is now a standalone Form Builder section and remains available for retrieve-only forms with no submission action enabled.
- Grouped **Authentication Profile** inside the **Integration** configuration for both Integrated Form data-source requests and Submission API requests.
- Added a blocking loading overlay while a public form submission is waiting for the backend/external API response. The submit button is disabled during processing to prevent duplicate submissions.
- Improved public-form submission error handling so an API submission error is shown on the loaded form instead of replacing it with the initial "Form unavailable" state.
- Cleaned the touched Form Builder code and added dedicated styling for the Integration and Available Fields sections.

## Validation note

The uploaded source did not include installed `node_modules`, so a full TypeScript/Vite build could not be completed in the sandbox. Run `npm install` and `npm run build` locally before deployment.
