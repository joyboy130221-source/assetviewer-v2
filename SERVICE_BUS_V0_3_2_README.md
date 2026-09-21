# Service Bus v0.3.2 - Message Body Viewer

Enhancements:
- Reusable MessageBodyViewer for Peek, View DLQ, and Service Bus Logs.
- Auto-detects JSON/XML/Text using content type/format and body fallback.
- Pretty and Raw modes.
- JSON indentation and XML indentation.
- Line numbers, scrollable monospace viewer, format badge, and Copy action.
- DLQ details keep dead-letter reason/description immediately above the body.
- Invalid JSON/XML gracefully falls back to raw content.

No destructive receive/delete/resubmit behavior was added.
