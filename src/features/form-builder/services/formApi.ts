import { api, jsonInit } from "../../../services/api";
import type {
  FormDefinition,
  FormSubmission,
  Organization,
  ApiAction,
} from "../model/form.types";
export const formApi = {
  organizations: async () =>
    (await api<{ data: Organization[] }>("/api/admin/organizations")).data,
  createOrganization: (body: Partial<Organization>) =>
    api("/api/admin/organizations", jsonInit("POST", body)),
  updateOrganization: (body: Partial<Organization>) =>
    api("/api/admin/organizations", jsonInit("PUT", body)),
  deleteOrganization: (id: string) =>
    api("/api/admin/organizations", jsonInit("DELETE", { id })),
  forms: async () =>
    (await api<{ data: FormDefinition[] }>("/api/admin/forms")).data,
  form: async (id: string) =>
    (
      await api<{ data: FormDefinition | null }>(
        `/api/admin/forms?id=${encodeURIComponent(id)}`,
      )
    ).data,
  createForm: async (body: Partial<FormDefinition>) =>
    (await api<{ id: string }>("/api/admin/forms", jsonInit("POST", body))).id,
  saveForm: (body: FormDefinition) =>
    api("/api/admin/forms", jsonInit("PUT", body)),
  deleteForm: (id: string) =>
    api("/api/admin/forms", jsonInit("DELETE", { id })),
  duplicateForm: async (id: string) =>
    (
      await api<{ id: string }>(
        "/api/admin/forms",
        jsonInit("POST", { duplicateOf: id }),
      )
    ).id,
  publicForm: async (id: string, queryString = "") =>
    (
      await api<{ data: FormDefinition }>(
        `/api/public-forms?id=${encodeURIComponent(id)}${queryString ? `&${queryString}` : ""}`,
      )
    ).data,
  submit: (id: string, values: Record<string, unknown>, queryString = "") =>
    api<{
      id: string;
      action?: {
        success: boolean;
        status?: number;
        error?: string;
        response?: unknown;
      };
      workflow?: Record<string, unknown>;
      workflowExecution?: {
        workflowExecutionId: string;
        status: "SUCCESS" | "FAILED";
        success: boolean;
        durationMs: number;
        steps: Array<{
          key: string;
          name: string;
          success: boolean;
          status?: number | null;
          error?: string | null;
          durationMs: number;
          request: {
            method: string;
            url: string;
            headers: Record<string, unknown>;
            params: Record<string, unknown>;
            body: unknown;
          };
          response: unknown;
        }>;
      } | null;
      responseAction?: { type: "message" | "redirect"; value: string } | null;
    }>(
      `/api/public-forms?id=${encodeURIComponent(id)}${queryString ? `&${queryString}` : ""}`,
      jsonInit("POST", { values }),
    ),
  testIntegration: (action: ApiAction, context: Record<string, unknown> = {}) =>
    api<{ response: unknown; fields: string[]; debug: any }>(
      "/api/admin/form-integration-test",
      jsonInit("POST", { action, context }),
    ),
  submissions: async (formId: string) =>
    (
      await api<{ data: FormSubmission[] }>(
        `/api/admin/form-submissions?formId=${encodeURIComponent(formId)}`,
      )
    ).data,
};
