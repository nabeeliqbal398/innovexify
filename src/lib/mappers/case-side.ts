import { DOC_TYPE, DOC_STATUS_MAP, FILING_STATUS } from "./enums";
import { toDay, toMs, type Ref } from "./common";
import type { DocStatus, FilingStatus } from "@/types/domain";

/**
 * What a case page shows from the neighbouring areas (documents, filings, messages), in the small form the page needs.
 * The full screens for those areas have their own mappers; these only describe the rows inside a case's tabs.
 */
export interface ApiCaseDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  fileName: string;
  requestedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: Ref | null;
}
export interface CaseDocument {
  id: string;
  name: string;
  type: string;
  status: DocStatus;
  hasFile: boolean;
  updatedAt: number;
  updatedByName?: string;
}

export interface ApiCaseFiling {
  id: string;
  displayNumber: string;
  type: string;
  status: string;
  submittedOn: string | null;
  reference: string;
  nextAction: string;
  nextActionDate: string | null;
}
export interface CaseFiling {
  id: string;
  display: string;
  type: string;
  status: FilingStatus;
  submitted: string;
  ref: string;
  next: string;
  nextDate: string;
}

export interface ApiCaseMessage {
  id: string;
  text: string;
  sender: { id: string; name: string; role: string };
  mine: boolean;
  attachment: { name?: string; fileName?: string } | null;
  createdAt: string;
}
export interface CaseMessage {
  id: string;
  text: string;
  from: string;
  fromName: string;
  fromRole: string;
  mine: boolean;
  attachmentName: string | null;
  at: number;
}

export const mapCaseSide = {
  document(d: ApiCaseDocument): CaseDocument {
    const updatedAt = Math.max(toMs(d.reviewedAt) ?? 0, toMs(d.submittedAt) ?? 0, toMs(d.requestedAt) ?? 0);
    return {
      id: d.id,
      name: d.name,
      type: DOC_TYPE.toLabel(d.type),
      status: DOC_STATUS_MAP.toLabel(d.status),
      hasFile: Boolean(d.fileName),
      updatedAt,
      updatedByName: d.reviewedAt ? d.reviewedBy?.name : undefined,
    };
  },
  filing(f: ApiCaseFiling): CaseFiling {
    return {
      id: f.id,
      display: f.displayNumber,
      type: f.type,
      status: FILING_STATUS.toLabel(f.status),
      submitted: toDay(f.submittedOn),
      ref: f.reference,
      next: f.nextAction,
      nextDate: toDay(f.nextActionDate),
    };
  },
  message(m: ApiCaseMessage): CaseMessage {
    return {
      id: m.id,
      text: m.text,
      from: m.sender.id,
      fromName: m.sender.name,
      fromRole: m.sender.role,
      mine: m.mine,
      attachmentName: m.attachment ? (m.attachment.name ?? m.attachment.fileName ?? "file") : null,
      at: toMs(m.createdAt) ?? 0,
    };
  },
};
