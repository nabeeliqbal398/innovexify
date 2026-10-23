import { fmtAt } from "@/lib/dates";
import type { AuditEntry } from "@/types/domain";
import { toMs, type Ref } from "./common";
import { ROLES } from "./enums";

/** `GET /audit`. */
export interface ApiAuditEntry {
  id: string;
  at: string;
  actor: Ref | null;
  actorRole: string | null;
  action: string;
  target: string;
  ok: boolean;
  category: string;
  requestId: string | null;
  ipAddress: string | null;
}

export function mapAuditEntry(a: ApiAuditEntry): AuditEntry {
  const at = toMs(a.at) ?? 0;
  return {
    id: a.id,
    time: fmtAt(at),
    at,
    actor: a.actor?.id ?? "",
    actorName: a.actor?.name,
    requestId: a.requestId,
    role: a.actorRole ? ROLES.toLabel(a.actorRole) : undefined,
    action: a.action,
    target: a.target,
    ok: a.ok,
    cat: a.category,
  };
}

import type { Company, Service, Trigger } from "@/types/domain";
import { CASE_STAGE } from "./enums";

/** `GET /company`. */
export interface ApiCompany {
  name: string;
  casePrefix: string;
  logo: string;
  updatedAt: string;
}

export const mapCompany = (c: ApiCompany): Company => ({ name: c.name, logo: c.logo, casePrefix: c.casePrefix });

/** `GET /services`. */
export interface ApiService {
  id: string;
  name: string;
  category: string;
  description: string;
  requirements: string[];
  stages: string[];
  turnaround: string;
  fee: string;
  active: boolean;
  activeCases?: number;
}

export const mapService = (s: ApiService): Service => ({
  id: s.id,
  name: s.name,
  category: s.category,
  desc: s.description,
  reqs: s.requirements,
  stages: s.stages.map((k) => CASE_STAGE.toLabel(k)),
  turnaround: s.turnaround,
  fee: s.fee,
  active: s.active,
  activeCases: s.activeCases,
});

/** `GET /automation/triggers`. */
export interface ApiTrigger {
  key: string;
  name: string;
  enabled: boolean;
  template: string;
  templateOptions: string[];
  security: boolean;
}

export const mapTrigger = (t: ApiTrigger): Trigger => ({ k: t.key, name: t.name, on: t.enabled, tpl: t.template, opts: t.templateOptions, security: t.security });

/** `GET /access/matrix`. */
export interface ApiAccessMatrix {
  roles: string[];
  rows: Array<{ label: string; permission: string; roles: string[] }>;
}
