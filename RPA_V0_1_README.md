# Browser RPA v0.1

This release adds the first end-to-end Browser RPA MVP to the existing multi-step workflow engine.

## Included

- Workflow steps can be either **API** or **Browser RPA**.
- Browser actions: Open Page, Click, Enter Text, Select Option, Wait for Element, Read Text.
- Browser steps in one workflow share one isolated Playwright browser context.
- Existing template values are resolved in browser step URL/selector/value fields.
- Read Text returns `{ "value": "..." }`, available to later steps as `{{steps.<stepKey>.response.value}}`.
- Browser execution is included in the existing Workflow Execution History.
- Browser/context is closed after each workflow execution.

## Local runner setup

After `npm install`, install Chromium once on the machine that executes Browser RPA:

```bash
npx playwright install chromium
```

Then run the application normally.

## Example workflow

1. Browser / Open Page -> `https://example.com`
2. Browser / Read Text -> selector `h1`, key `readTitle`
3. API step can reference `{{steps.readTitle.response.value}}`.

## v0.1 boundary

This is the Browser RPA MVP. It intentionally does not yet include persistent SSO sessions, credential profiles for browser login, customer-side remote agents, queues, scheduling, recorder, retry policies, or desktop automation. Those belong to later RPA releases. For production deployment, run browser automation in a dedicated runner/agent and apply destination allowlisting and the security controls from the RPA roadmap.
