# Form Builder v6.5

New: Combobox; Integrated Form API client; backend Test Request; response-field discovery; click-to-add mapped fields; persisted source_action; published integrated forms populate mapped fields from the source API.

Database: no manual migration required. Startup adds `source_action JSONB` with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

Security: integration calls are server-side, HTTP/HTTPS only, private/local destinations and redirects are blocked, 15 second timeout.
