import { DOC_STATUS_MAP, CASE_STAGE, CASE_STATUS } from "./enums";
import { toDay, toMs } from "./common";
import type { CaseStatus, DocStatus } from "@/types/domain";

/** What the client's Home page needs of their own case, documents and shared tasks. Small on purpose: other screens own the full records. */
export interface HomeCase {
  id: string;
  display: string;
  stageIdx: number;
  stage: string;
  status: CaseStatus;
  deadline: string;
  events: Array<{ id: string; stage: string; at: number }>;
}

export interface ApiHomeCase {
  id: string;
  displayNumber: string;
  stage: string;
  status: string;
  deadline: string | null;
  events?: Array<{ id: string; toStage: string | null; at: string }>;
}

export function mapHomeCase(c: ApiHomeCase): HomeCase {
  return {
    id: c.id,
    display: c.displayNumber,
    stageIdx: Math.max(0, CASE_STAGE.index(c.stage)),
    stage: CASE_STAGE.toLabel(c.stage),
    status: CASE_STATUS.toLabel(c.status),
    deadline: toDay(c.deadline),
    events: (c.events ?? []).filter((e) => e.toStage).map((e) => ({ id: e.id, stage: CASE_STAGE.toLabel(e.toStage), at: toMs(e.at) ?? 0 })),
  };
}

export interface HomeDoc {
  id: string;
  name: string;
  status: DocStatus;
  reason: string;
  note: string;
  requestedAt?: number;
  reviewedAt?: number;
}

export interface ApiHomeDoc {
  id: string;
  name: string;
  status: string;
  reason: string;
  note: string;
  requestedAt: string | null;
  reviewedAt: string | null;
}

export function mapHomeDoc(d: ApiHomeDoc): HomeDoc {
  return {
    id: d.id,
    name: d.name,
    status: DOC_STATUS_MAP.toLabel(d.status),
    reason: d.reason,
    note: d.note,
    requestedAt: toMs(d.requestedAt),
    reviewedAt: toMs(d.reviewedAt),
  };
}

export interface HomeTask {
  id: string;
  title: string;
  due: string;
  done: boolean;
}

export interface ApiHomeTask {
  id: string;
  title: string;
  due: string;
  done: boolean;
}

export const mapHomeTask = (t: ApiHomeTask): HomeTask => ({ id: t.id, title: t.title, due: toDay(t.due), done: t.done });
