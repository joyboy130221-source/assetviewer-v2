# Service Bus Messaging v0.1.2

This release refines the Azure Service Bus Messaging administration experience.

## Changes

- Renamed the Integration menu from **Messaging** to **Service Bus Messaging**.
- Connection String uses a three-line textarea when creating or editing a connection.
- Queue and Topic headings show the number of discovered entities.
- Topic list shows approximately eight rows before becoming vertically scrollable.
- Clicking a Topic selects it and automatically fills **Destination Type = Topic** and **Destination**.
- Application Properties now use a Service Bus Explorer-style Key / Type / Value editor.
  - Supported UI types: String, Number, Boolean.
  - Properties are converted to typed `applicationProperties` before sending.
- Send Message action is aligned to the bottom-right of the form.

## Notes

Connection strings remain encrypted at rest by the existing backend implementation and are not returned to the browser after saving.
