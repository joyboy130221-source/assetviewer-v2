import type { QueryParameters } from "../../../shared/http/queryParams";
import type {
  BrowserAction,
  MessageBusAction,
  WorkflowStepType,
} from "../../../shared/workflow/workflowStep.types";

/** Reuse the shared workflow action type across API Watcher components. */
export type WatcherActionType = WorkflowStepType;
export type KeyValue = { key: string; value: string };
export type BodyFormat = "json" | "xml" | "text";
export type RestAction = {
  method: string;
  url: string;
  authProfileId?: string;
  headers: Record<string, string>;
  params: QueryParameters;
  body?: unknown;
  bodyFormat?: BodyFormat;
};
/**
 * One step of an API Watcher chain (enrichment or event action).
 * `type` is optional for backward compatibility: steps saved before chain
 * v2 have no type and are REST (API) steps.
 */
export type WatcherStep = {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  type?: WorkflowStepType;
  action?: RestAction;
  browser?: BrowserAction;
  message?: MessageBusAction;
};
/** @deprecated Use WatcherStep. Kept for source compatibility. */
export type EnrichmentStep = WatcherStep;
export type EventAction = {
  enabled: boolean;
  /**
   * Chain executed for the event (v2). When absent, the legacy single
   * `action` is executed. When present, `action` only mirrors the first API
   * step for readers that predate chains.
   */
  steps?: WatcherStep[];
  action?: RestAction;
  targetRecordIdPath?: string;
  /** Step whose output holds the target id. Defaults to the last step. */
  targetRecordIdStepKey?: string;
};
export type ApiWatcherDefinition = {
  id?: string;
  organizationId: string;
  name: string;
  description: string;
  active: boolean;
  source: { action: RestAction; recordsPath: string; checkpointParam: string };
  changeDetection: {
    recordIdField: string;
    lastUpdatedField: string;
    sourceTimezone: string;
    initialMode: "startNow" | "processExisting" | "startAt";
    initialStartAt?: string;
  };
  enrichmentSteps?: WatcherStep[];
  events: { onNew: EventAction; onModified: EventAction };
  performance: {
    intervalSeconds: number;
    maxRecordsPerRun: number;
    concurrency: number;
    timeoutMs: number;
    retryCount: number;
    overlapSeconds: number;
    maxEnrichmentSteps?: number;
    /** Max enabled steps executed per event chain. */
    maxEventSteps?: number;
    /** Concurrent isolated browser sessions per run (Browser RPA). */
    browserConcurrency?: number;
    /** Ceiling for any Browser RPA action timeout (ms). */
    browserTimeoutMs?: number;
    /** Ceiling for Message Bus DLQ monitoring windows (seconds). */
    maxDlqWindowSeconds?: number;
  };
};
export type ApiWatcherRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  name: string;
  description: string;
  active: boolean;
  definition: ApiWatcherDefinition;
  last_run_at?: string;
  next_run_at?: string;
  last_status?: string;
  updated_at: string;
};
export type SourceTestResult = {
  status: number;
  recordsPath: string;
  fields: string[];
  candidates: { path: string; count: number; fields: string[] }[];
  sample: unknown[];
  count: number;
};
export type WatcherExecution = {
  id: string;
  status: string;
  success: boolean;
  duration_ms: number;
  records_received: number;
  new_records: number;
  modified_records: number;
  ignored_records: number;
  failed_records: number;
  error_message?: string;
  started_at: string;
  completed_at?: string;
};
export type WatcherStepLog = {
  id: number;
  execution_id: string;
  source_record_id?: string;
  event_type?: string;
  step_type: string;
  /** api | browser | message (absent on logs written before chain v2). */
  action_type?: string;
  step_key?: string;
  step_name?: string;
  sequence: number;
  status: string;
  success: boolean;
  duration_ms: number;
  request_method?: string;
  request_url?: string;
  request_headers?: Record<string, string>;
  request_params?: QueryParameters;
  request_body?: string;
  request_content_type?: string;
  response_status?: number;
  response_body?: string;
  response_content_type?: string;
  error_message?: string;
  created_at: string;
};
