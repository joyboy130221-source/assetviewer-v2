# Browser RPA Foundation — v0.1.5

This release completes and stabilizes the Browser RPA foundation before the Authentication & Security phase.

## Browser actions

- Open Page with page-readiness strategy
- Click
- Enter Text
- Select Option
- Wait for Element (visible, hidden, attached, detached)
- Delay
- Read Text
- Read Attribute
- Check / Uncheck
- Upload File (runner-local path in this MVP)
- Download File to an isolated temporary execution directory
- Screenshot (full page or selected element)
- Press Key
- Hover
- Scroll Into View
- Switch to Latest Tab / Window

## Reliability

- Per-step timeout (1–120 seconds)
- Selector matching: strict/single, first, last, nth (0-based)
- Optional iframe selector
- Shared isolated Playwright browser context for browser steps in one workflow
- Standard response `value` for actions that naturally produce a value
- Automatic failure screenshot when a browser step throws

## Notes before v0.2

This remains an MVP runner. Credentials, SSO sessions, domain allowlists, RPA-specific RBAC, secure artifact serving/retention, and a separate customer-side RPA Agent belong to v0.2 and later phases.

For local browser execution, install Chromium once on the runner:

    npx playwright install chromium
