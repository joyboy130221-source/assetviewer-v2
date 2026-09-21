# Messaging v0.1

This release starts Azure Service Bus support and fixes Available Fields insertion for Browser RPA parameters.

## Messaging v0.1
- New **Integration > Messaging** menu.
- New `messaging` Role Management permission.
- Azure Service Bus connection profiles with AES-256-GCM encrypted connection strings.
- Test Connection.
- Browse queues and topics.
- Non-destructive Peek for queue messages.
- Send messages to queues or topics with JSON/text body, content type, message ID, and application properties.
- New **Message Bus** workflow step. Workflow templates such as `{{assetId}}` and `{{steps.getAsset.response.assetnum}}` can be used in destination/body/properties.
- Message workflow activity is written into the existing Workflow Execution History as `MESSAGE:SEND`.

## RPA Available Fields fix
Clicking an Available Field now inserts the template token into the currently focused Browser RPA parameter editor, including URL, selector, frame selector, value, attribute name, key, file path, and file name.

## Dependency
Messaging uses the official `@azure/service-bus` Node SDK. Run `npm install` after extracting this release. The source package intentionally does not include `node_modules`.

## Security
Connection strings are encrypted with the existing `CREDENTIAL_ENCRYPTION_KEY` and are never returned to the frontend. Keep the same encryption key when upgrading an existing database.
