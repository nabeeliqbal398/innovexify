import type { CaseStage } from "@prisma/client";

/** One entry of the service catalog, exactly as the Service table stores it. */
export interface CatalogService {
  id: string;
  name: string;
  category: string;
  description: string;
  requirements: string[];
  stages: CaseStage[];
  active: boolean;
}

/**
 * The default service catalog. The development seed and `npm run bootstrap:catalog` (the first-run step in production) both use this list,
 * so a fresh production database offers the same services as the demo, with none of the demo clients, tasks or documents.
 */
export const DEFAULT_SERVICES: CatalogService[] = (() => {
  const svc = (id: string, name: string, category: string, description: string, requirements: string[], stages: CaseStage[], active = true) => ({
    id,
    name,
    category,
    description,
    requirements,
    stages,
    active,
  });
  const llc: CaseStage[] = ["CLIENT_ONBOARDING", "INFORMATION_REQUIRED", "DOCUMENTS_PENDING", "DOCUMENTS_UNDER_REVIEW", "READY_FOR_FILING", "STATE_FILING_IN_PROGRESS", "STATE_APPROVAL_RECEIVED", "POST_FORMATION_DOCUMENTS", "COMPLETED"];
  return [
    svc("llc", "LLC formation", "Formation", "Form a limited liability company in the client's chosen state.", ["Owner identity documents", "Proof of address", "Business name options", "Member and ownership details"], llc),
    svc("corp", "Corporation formation", "Formation", "Incorporate a C or S corporation, including initial share structure.", ["Director and officer details", "Share structure worksheet", "Identity documents"], ["CLIENT_ONBOARDING", "INFORMATION_REQUIRED", "DOCUMENTS_UNDER_REVIEW", "READY_FOR_FILING", "STATE_FILING_IN_PROGRESS", "STATE_APPROVAL_RECEIVED", "COMPLETED"]),
    svc("ra", "Registered agent service", "Compliance", "Provide a registered agent address and forward official notices.", ["Entity name and state", "Agent consent form"], ["CLIENT_ONBOARDING", "DOCUMENTS_UNDER_REVIEW", "COMPLETED"]),
    svc("ein", "EIN assistance", "Tax", "Help the client prepare and submit an EIN application.", ["Responsible party details", "Formation documents"], ["INFORMATION_REQUIRED", "DOCUMENTS_UNDER_REVIEW", "EIN_PROCESSING", "COMPLETED"]),
    svc("oa", "Operating agreement preparation", "Documents", "Prepare a single- or multi-member operating agreement.", ["Member list and ownership percentages", "Management structure"], ["INFORMATION_REQUIRED", "DOCUMENTS_UNDER_REVIEW", "COMPLETED"]),
    svc("annual", "Annual report assistance", "Compliance", "Remind the client and help prepare state annual reports.", ["Current entity details", "State account access, if applicable"], ["INFORMATION_REQUIRED", "READY_FOR_FILING", "STATE_FILING_IN_PROGRESS", "COMPLETED"]),
    svc("deadlines", "Compliance deadline support", "Compliance", "Track compliance reminders the client has asked the team to watch.", ["Entity list", "Reminder preferences"], ["CLIENT_ONBOARDING", "COMPLETED"]),
    svc("address", "Business address and mail handling", "Operations", "Business address and mail scanning, where offered.", ["Identity documents", "Proof of address", "Mail handling authorization"], ["CLIENT_ONBOARDING", "DOCUMENTS_UNDER_REVIEW", "COMPLETED"], false),
    svc("post", "Post-formation documentation", "Documents", "Prepare the post-formation package: resolutions, member certificates and records.", ["Approved formation documents"], ["POST_FORMATION_DOCUMENTS", "COMPLETED"]),
    svc("amend", "Business amendments and updates", "Formation", "Amend entity details such as name, members or address with the state.", ["Change details", "Supporting documents"], ["INFORMATION_REQUIRED", "DOCUMENTS_UNDER_REVIEW", "READY_FOR_FILING", "STATE_FILING_IN_PROGRESS", "COMPLETED"]),
  ];
})();
