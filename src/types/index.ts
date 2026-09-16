export type JsonRecord = Record<string, unknown>;
export interface AdminUser {
  name: string;
  role: string;
  permissions?: Record<string, boolean>;
}
export interface WorkOrder extends JsonRecord {
  wonum?: string;
  siteid?: string;
  orgid?: string;
  assetnum?: string;
  location?: string;
  description?: string;
  status?: string;
  status_description?: string;
  wopriority?: string | number;
  worktype?: string;
  failurecode?: string;
  reportedby?: string;
}
export interface Worklog {
  worklogid?: number | string | null;
  description?: string;
  description_longdescription?: string;
  logtype?: string;
  createby?: string;
  createdate?: string;
  _draftId?: string;
}
