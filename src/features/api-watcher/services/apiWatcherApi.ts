import { api, jsonInit } from "../../../services/api";
import type {
  ApiWatcherDefinition,
  ApiWatcherRow,
  SourceTestResult,
  WatcherExecution,
  WatcherStepLog,
} from "../model/apiWatcher.types";
import type { MessageConnectionOption } from "../../../shared/workflow/workflowStep.types";

export type ClearWatcherCacheResult = {
  clearedRecords: number;
  checkpointResetTo: string;
};

export const apiWatcherApi = {
  /** Service Bus connections usable by an organization (id/name only). */
  messageConnections: (organizationId: string) =>
    api<{ data: MessageConnectionOption[] }>(
      `/api/admin/api-watchers?lookup=messageConnections&organizationId=${encodeURIComponent(organizationId)}`,
    ).then((x) => x.data),
  list: () =>
    api<{ data: ApiWatcherRow[] }>("/api/admin/api-watchers").then(
      (x) => x.data,
    ),
  get: (id: string) =>
    api<{ data: ApiWatcherRow }>(
      `/api/admin/api-watchers?id=${encodeURIComponent(id)}`,
    ).then((x) => x.data),
  create: (definition: ApiWatcherDefinition) =>
    api<{ id: string }>(
      "/api/admin/api-watchers",
      jsonInit("POST", { definition }),
    ).then((x) => x.id),
  save: (definition: ApiWatcherDefinition) =>
    api("/api/admin/api-watchers", jsonInit("PUT", { definition })),
  remove: (id: string) =>
    api("/api/admin/api-watchers", jsonInit("DELETE", { id })),
  test: (definition: ApiWatcherDefinition) =>
    api<{ data: SourceTestResult }>(
      "/api/admin/api-watchers?action=test",
      jsonInit("POST", { definition }),
    ).then((x) => x.data),
  run: (id: string) =>
    api<{ data: unknown }>(
      "/api/admin/api-watchers?action=run",
      jsonInit("POST", { id }),
    ).then((x) => x.data),
  setActive: (id: string, active: boolean) =>
    api(
      "/api/admin/api-watchers?action=set-active",
      jsonInit("POST", { id, active }),
    ),
  clearSuccessCache: (id: string) =>
    api<{ data: ClearWatcherCacheResult }>(
      "/api/admin/api-watchers?action=clear-success-cache",
      jsonInit("POST", { id }),
    ).then((x) => x.data),
  executions: (id: string) =>
    api<{ data: WatcherExecution[] }>(
      `/api/admin/api-watchers?executions=${encodeURIComponent(id)}`,
    ).then((x) => x.data),
  executionLogs: (watcherId: string, executionId: string) =>
    api<{ data: WatcherStepLog[] }>(
      `/api/admin/api-watchers?watcherId=${encodeURIComponent(watcherId)}&executionLogs=${encodeURIComponent(executionId)}`,
    ).then((x) => x.data),
};
