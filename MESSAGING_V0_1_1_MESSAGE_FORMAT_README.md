# Messaging v0.1.1 - Message Format

Adds an explicit Message Format selector to Messaging and Message Bus workflow steps.

Supported formats:
- JSON -> application/json; JSON body is validated and sent as a structured JSON body.
- XML -> application/xml; body is preserved and sent as text.
- Text -> text/plain; body is preserved and sent as text.

Existing workflow definitions remain compatible. If messageFormat is absent, the runtime infers the format from contentType and otherwise defaults to JSON.

Template expressions continue to work in message bodies before the message is sent.
