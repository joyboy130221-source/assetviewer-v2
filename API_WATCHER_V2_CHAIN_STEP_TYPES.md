# API Watcher v2 — Browser RPA & Message Bus chain steps

Enrichment steps and both event actions (**New Record** / **Modified Record**) are now typed step **chains**. Each step can be:

| Step type   | What it does                                                        | Output for later steps                                  |
|-------------|---------------------------------------------------------------------|---------------------------------------------------------|
| API         | REST call (unchanged behaviour)                                     | `{{steps.<key>.<responseField>}}`                       |
| Browser RPA | Playwright action (open page, click, enter text, read text…)        | `{{steps.<key>.value}}` (+ `url`, `title`, `fileName`…) |
| Message Bus | Azure Service Bus **Send Message** or **Check Dead Letter**         | `{{steps.<key>.messageId}}`, DLQ: `{{steps.<key>.status}}` |

## Templates and Available Fields
* Every text parameter supports templates: Browser URL, selector, frame selector, value, attribute, key, file path/name; Message Bus destination, subscription, message ID, correlation ID, body and application properties; REST URL, header values, query values and body.
* Click a parameter, then click an **Available Fields** token to insert it at the cursor. REST steps fall back to the body when nothing is selected, as before.
* Each step only offers the outputs of steps that run **before** it. Event steps also see every enrichment step.
* Step keys must be unique across the enrichment chain and each event chain. Both the designer and the server check this.

## Runtime behaviour
* Steps run in order. The first failing step stops the record's chain, and the record is retried according to **Retry Count**.
* **Browser RPA:** all browser steps of one record (enrichment + event) share one isolated browser context. A run launches at most one Chromium process, and only when a chain contains a browser step. A failed browser step captures a screenshot. Values typed into password/secret/token-like selectors are redacted in logs.
* **Message Bus:** a record retry **reuses** a message that was already sent instead of publishing it twice (logged as `REUSED`). Connections are opened once per run and reused for every record.
* **Target Record ID:** read from the selected *Target Record ID Step* (default: last step) using *Target Record ID Response Path*.

## Multi-tenant
* Service Bus connections can now be assigned to an organization (**Integration › Messaging › Organization**). Blank means shared, which is the behaviour for every existing connection.
* Watchers can only use shared connections or connections owned by their organization. This is enforced when a watcher is saved **and** when it runs. Form Builder workflows enforce the same rule.
* The designer loads connections through `GET /api/admin/api-watchers?lookup=messageConnections&organizationId=…`. It returns only id and name, and needs only the `apiWatchers` permission.

## Performance (per watcher, section 5)
| Setting                         | Default | Ceiling (env)                                  |
|---------------------------------|---------|------------------------------------------------|
| Max Event Chain Steps           | 10      | `WORKFLOW_MAX_CHAIN_STEPS` (25)                |
| Concurrent Browser Sessions     | 2       | `WORKFLOW_BROWSER_MAX_CONCURRENCY` (5)         |
| Browser Action Timeout Ceiling  | 30000ms | `WORKFLOW_BROWSER_MAX_TIMEOUT_MS` (120000)     |
| DLQ Monitoring Ceiling          | 30s     | `WORKFLOW_MESSAGE_DLQ_MAX_WINDOW_SECONDS` (600)|

Other environment variables: `WORKFLOW_BROWSER_DEFAULT_TIMEOUT_MS`, `WORKFLOW_BROWSER_HEADLESS`, `WORKFLOW_MESSAGE_DLQ_PEEK_COUNT`.

**Fix:** a Retry Count, Checkpoint Overlap or Max Enrichment Steps value of `0` is now honoured. Previously `0` fell back to the default (2 / 5 / 10).

## Backward compatibility
* Steps without `type` are API steps.
* Events saved with a single `action` still run unchanged. The designer upgrades them to a one-step chain with key `new` / `modified` (the key already used in monitoring logs). A legacy action with no URL becomes an empty chain.
* On save, `events.*.action` mirrors the first enabled API step, so older builds can still read the definition.
* Schema changes are additive: `api_watcher_step_logs.request_method` is widened to 60 characters, and new columns `api_watcher_step_logs.action_type` and `message_bus_connections.organization_id` are added.
* The Form Builder workflow now uses the same shared Browser RPA / Message Bus editors and runtime. As a bonus, Message Bus parameters there accept Available Fields tokens and a Correlation ID can be set.

## Deployment notes
* Browser RPA needs Playwright + Chromium on the machine that runs the watcher (`npx playwright install chromium`). The Vercel serverless cron cannot run Chromium, so run browser-based watchers on a Node runner (`npm run dev:backend` / `server/local-server.js`).
* A DLQ check holds a record worker for its monitoring window. Keep windows short on serverless deployments with an execution time limit.

## Code map
* `server/services/api-watcher-chain.js`: pure chain model and validation
* `server/services/api-watcher-service.js`: `createChainRunner`, `performanceSettings`
* `server/lib/workflow/message-bus-step.js`: shared Message Bus step runtime (Form Builder + Watcher)
* `server/lib/browser-rpa.js`: `BrowserPool` (shared browser, bounded contexts)
* `server/lib/service-bus.js`: `createClientCache`
* `server/config/workflow-limits.js`: environment ceilings
* `src/shared/workflow/*`: shared step types, `useTemplateInsertion`, `BrowserActionFields`, `MessageBusActionFields`
* `src/features/api-watcher/components/WatcherChainEditor.tsx`, `RestActionEditor.tsx`, `TemplateFieldList.tsx`, `model/watcherChain.ts`
