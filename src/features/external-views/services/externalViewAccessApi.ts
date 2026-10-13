import { api, jsonInit } from "../../../services/api";

export type GeneratedAccessKey = {
  message: string;
  accessKey: string;
  /** Configured External View URL with the key appended (shown once). */
  link: string;
};

export const externalViewAccessApi = {
  generate: (id: number) =>
    api<GeneratedAccessKey>(
      "/api/admin/external-views?action=generate-key",
      jsonInit("POST", { id }),
    ),
  revoke: (id: number) =>
    api<{ message: string }>(
      "/api/admin/external-views?action=revoke-key",
      jsonInit("POST", { id }),
    ),
};
