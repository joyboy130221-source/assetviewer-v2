# Form Builder v6.6

Enhancements:
- Fixed radio/combobox option editing so more than two options can be entered.
- Added per-field Read Only and Default Value / Template properties.
- Added form-level Show Submit Button and editable Submit Button Label.
- Added Duplicate Form action; duplicates are created as drafts with new form/field IDs.
- Added declared Form Query Parameters. Published links include template placeholders.
- Query parameter values are available to integrated source API templates, submission API templates, and field default-value templates.
- Matching query parameter/field names automatically initialize the field value.
- Submission records persist the allowed query parameter context in `query_context`.

Database changes are additive and applied automatically by `server/lib/db.js`; existing tables do not need to be dropped.
