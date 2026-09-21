# Service Bus v0.3.1

- Peek results now open immediately in a visible modal Message Explorer instead of rendering below the current viewport.
- Empty Peek results explicitly show "No messages found" and a toast instead of appearing to do nothing.
- Successful Peek shows the number of returned messages.
- Queue Peek converts Buffer payloads to UTF-8 text for readable XML/Text bodies.
- Service Bus connection selector now uses the shared `app-combobox` styling used by the rest of the administration UI.
- `.env.local` is intentionally excluded from the distributable ZIP.
