# API Watcher Event Action Step Type UI Fix — v8.21.1

## Acceptance issue
The v8.21 source contained multi-action event support, but the delivered/running UI reported by the user did not visibly expose the Step Type control in sections 6A and 6B.

## Correction
The shared `EventEditor` used by both sections now renders a dedicated, prominent Step Type panel immediately below the section heading. It exposes:
- API
- Browser RPA
- Service Bus

The selected type is also echoed next to the selector. The editor below is switched by the selected type and reuses the existing REST, Browser RPA, and Service Bus editors/execution paths.

## Verification
Static acceptance checks confirm both 6A and 6B instantiate the shared `EventEditor`, and that `EventEditor` contains the three options plus Browser RPA and Service Bus editor branches. No `.js`/`.jsx` source siblings exist under `src` that could shadow TypeScript/TSX files.

Backend `node --check` passed for the API Watcher execution/API/repository and shared HTTP files.

`npm run build` was executed. It could not complete because dependency installation is incomplete in the execution environment; `npm ci` timed out and TypeScript reports missing installed type definitions such as React, Node, Express, Babel and related transitive definitions. A successful production build is therefore not claimed.
