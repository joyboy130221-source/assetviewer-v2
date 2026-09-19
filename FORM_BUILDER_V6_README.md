# Form Builder v6 - Backend Persistence & Multi-Tenant

## Added
- PostgreSQL persistence for organizations, form definitions, submissions and submission API-action history.
- Setup > Organizations / Tenants master page.
- Organization ownership on every form and submission.
- Published-form copy-link action.
- Submission API Action designer (method, URL, headers, query params and JSON body).
- `{{fieldName}}` template resolution from submitted values.
- Unique field-name validation per form.
- Server-side outbound API execution after the submission is persisted.
- API action history shown beside each submission.
- Enterprise UI font stack: Inter / Segoe UI / Roboto / Helvetica / Arial.

## Database
Tables are created automatically by `server/lib/db.js` when the application first accesses PostgreSQL:
- organizations
- form_definitions
- form_submissions
- form_action_logs

No manual SQL migration is required for this prototype version.

## API Action security
Outbound action requests run on the backend. HTTP/HTTPS only; localhost and private IP destinations are blocked to reduce SSRF risk. Timeout is 15 seconds. Redirects are rejected.

Do not put long-lived secrets directly into form templates for production. A future iteration should add encrypted reusable credentials / secret references for Authorization headers.

## Local run
1. Configure `.env.local` with DATABASE_URL, SESSION_SECRET and CREDENTIAL_ENCRYPTION_KEY.
2. Run `npm install`.
3. Run `npm run dev`.

## Template example
```json
{
  "assetNumber": "{{assetNumber}}",
  "name": "{{assetName}}"
}
```
