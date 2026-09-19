# Form Builder v6.7 bug-fix release

## Fixes

- Fixed the drag/drop crash in `PropertiesPanel.tsx`. JSX previously interpreted `{{parameterName}}` as a JavaScript object expression referencing an undefined variable. The help text is now rendered as a literal template example.
- Fixed adding multiple Header rows in Submission API Action.
- Fixed adding multiple Query Parameter rows in Submission API Action.
- Fixed adding multiple Header rows in Integrated Form Data Source.
- Fixed adding multiple Query Parameter rows in Integrated Form Data Source.

## Root cause of API row issue

Blank editor rows are UI draft state and intentionally are not persisted until a key is entered. Previous effects immediately re-created row state from the persisted object after every parent update, so a newly-added blank row disappeared. v6.7 keeps draft rows in component-local state while continuing to persist completed key/value rows to the form definition.

## Database

No database migration is required for v6.7.

## Validation

Backend/database structure is unchanged. A complete frontend build could not be completed in the packaging environment because npm dependency installation timed out and left incomplete type packages. Run `npm install` followed by `npm run build` in your normal development environment.
