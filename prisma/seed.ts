import { config as loadDotenv } from "dotenv";

import {
  CaseStage,
  Prisma,
  PrismaClient,
  Role,
  UserStatus,
  type AnnouncementPriority,
  type DocStatus,
  type DocType,
  type FilingStatus,
  type InteractionType,
  type NotificationCategory,
  type Priority,
  type ReportCategory,
  type ReportStatus,
  type TicketCategory,
  type TicketStatus,
} from "@prisma/client";
import * as argon2 from "argon2";

/**
 * Reproduces the first prototype's demo data (frontend/src/lib/seed.ts).
 * Idempotent: every row is upserted by a stable key and existing rows are left as they are,
 * so running it twice never duplicates or overwrites live data. Dates are relative to today.
 */

loadDotenv({ quiet: true });

const prisma = new PrismaClient();
const DAY = 86_400_000;

function dayStart(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
/** Timestamp `days` from today at `hour` o'clock. */
function at(days: number, hour = 10): Date {
  const d = new Date(dayStart() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
}
/** Calendar date `days` from today, for @db.Date columns. */
function dateOn(days: number): Date {
  const d = new Date(dayStart() + days * DAY);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** "Waiting for Client" -> "WAITING_FOR_CLIENT". */
const enumKey = (label: string): string => label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

const STAGES: CaseStage[] = [
  "INVITATION_SENT",
  "CLIENT_ONBOARDING",
  "INFORMATION_REQUIRED",
  "DOCUMENTS_PENDING",
  "DOCUMENTS_UNDER_REVIEW",
  "READY_FOR_FILING",
  "STATE_FILING_IN_PROGRESS",
  "STATE_APPROVAL_RECEIVED",
  "EIN_PROCESSING",
  "POST_FORMATION_DOCUMENTS",
  "COMPLETED",
];

const TICKET_CATEGORY: Record<string, TicketCategory> = {
  "Formation delay": "FORMATION_DELAY",
  "Document problem": "DOCUMENT_PROBLEM",
  "Incorrect client information": "INCORRECT_INFORMATION",
  "Communication issue": "COMMUNICATION_ISSUE",
  "General service request": "GENERAL_REQUEST",
  "Technical problem": "TECHNICAL_PROBLEM",
  Complaint: "COMPLAINT",
};

const priority = (label: string): Priority => enumKey(label) as Priority;
const ticketStatus = (label: string): TicketStatus => enumKey(label) as TicketStatus;
const interaction = (label: string): InteractionType => enumKey(label) as InteractionType;

function requireSeedPassword(): string {
  const value = process.env.SEED_PASSWORD;
  if (!value) throw new Error("SEED_PASSWORD is not set. Add it to .env (see .env.example) before seeding.");
  if (value.length < 12 || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    throw new Error("SEED_PASSWORD must be at least 12 characters with an uppercase letter and a number.");
  }
  return value;
}

interface StaffSeed {
  id: string;
  name: string;
  role: Role;
}
interface ClientSeed {
  id: string;
  name: string;
  email: string;
  number: string;
  csr: string | null;
  biz: string;
  state: string;
  invited?: boolean;
  phone?: string;
  address?: string;
  joinedDaysAgo?: number;
}

const STAFF: StaffSeed[] = [
  { id: "u1", name: "Sarah Bennett", role: "ADMIN" },
  { id: "u2", name: "Daniel Reyes", role: "MANAGER" },
  { id: "u3", name: "John Smith", role: "CSR" },
  { id: "u4", name: "Ayesha Khan", role: "CSR" },
  { id: "u5", name: "Maya Chen", role: "COMPLIANCE" },
  { id: "u6", name: "Omar Haddad", role: "COMPLIANCE" },
];

const CLIENTS: ClientSeed[] = [
  { id: "c42", name: "Alex Morgan", email: "alex.morgan@northfield.co", number: "0042", csr: "u3", biz: "Northfield Studio LLC", state: "Wyoming", phone: "+1 307 555 0142", address: "1200 Main St, Cheyenne, WY", joinedDaysAgo: 24 },
  { id: "c43", name: "Sarah Johnson", email: "sarah@bluewateranalytics.com", number: "0043", csr: "u4", biz: "Bluewater Analytics LLC", state: "Delaware" },
  { id: "c47", name: "Michael Carter", email: "michael@cartercoastal.com", number: "0047", csr: "u3", biz: "Carter Coastal Logistics LLC", state: "Florida" },
  { id: "c49", name: "Emma Wilson", email: "emma@wilsonridge.co", number: "0049", csr: "u4", biz: "Wilson Ridge Ventures LLC", state: "Texas" },
  { id: "c53", name: "Tomás Rivera", email: "tomas@riveraimports.mx", number: "0053", csr: null, biz: "", state: "", invited: true },
  { id: "c31", name: "Hannah Lee", email: "hannah@leebotanicals.co", number: "0031", csr: "u3", biz: "Lee Botanicals LLC", state: "Wyoming" },
  { id: "c34", name: "Marcus Oyelaran", email: "marcus@oyelaranfreight.com", number: "0034", csr: "u4", biz: "Oyelaran Freight LLC", state: "Delaware" },
  { id: "c36", name: "Grace Okafor", email: "grace@okaforconsulting.co", number: "0036", csr: "u3", biz: "Okafor Consulting LLC", state: "New Mexico" },
  { id: "c38", name: "Ines Moreau", email: "ines@moreauimports.fr", number: "0038", csr: "u4", biz: "Moreau Imports LLC", state: "Florida" },
  { id: "c40", name: "Ravi Patel", email: "ravi@patelanalytics.io", number: "0040", csr: "u3", biz: "Patel Analytics LLC", state: "Texas" },
  { id: "c45", name: "Noah Becker", email: "noah@beckerrobotics.com", number: "0045", csr: "u3", biz: "Becker Robotics Inc.", state: "Delaware" },
  { id: "c46", name: "Aisha Rahman", email: "aisha@rahmantextiles.com", number: "0046", csr: "u4", biz: "Rahman Textiles LLC", state: "Wyoming" },
];

const ROLE_OF: Record<string, Role> = Object.fromEntries([
  ...STAFF.map((s) => [s.id, s.role] as const),
  ...CLIENTS.map((c) => [c.id, "CLIENT" as Role] as const),
]);

async function seedCompany(): Promise<void> {
  await prisma.company.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: "Innovexify", logo: "", casePrefix: "CASE" },
  });
}

async function seedUsers(passwordHash: string): Promise<void> {
  const prefs: NotificationCategory[] = ["MESSAGES", "DOCUMENTS", "STAGE", "TICKETS", "ANNOUNCEMENTS"];
  for (const s of STAFF) {
    await prisma.user.upsert({
      where: { id: s.id },
      update: {},
      create: { id: s.id, email: `${s.name.toLowerCase().replace(/\s+/g, ".")}@example.com`, name: s.name, role: s.role, status: UserStatus.ACTIVE, passwordHash },
    });
  }
  for (const c of CLIENTS) {
    await prisma.user.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        email: c.email,
        name: c.name,
        role: "CLIENT",
        status: c.invited ? UserStatus.INVITED : UserStatus.ACTIVE,
        passwordHash: c.invited ? null : passwordHash,
        invitedById: c.invited ? "u2" : null,
      },
    });
    await prisma.clientProfile.upsert({
      where: { userId: c.id },
      update: {},
      create: {
        userId: c.id,
        caseNumber: `CASE-2026-${c.number}`,
        csrId: c.csr,
        businessName: c.biz,
        formationState: c.state,
        phone: c.phone ?? "",
        address: c.address ?? "",
        joinedAt: at(-(c.joinedDaysAgo ?? 40)),
      },
    });
    for (const category of prefs) {
      await prisma.notificationPreference.upsert({
        where: { userId_category: { userId: c.id, category } },
        update: {},
        create: { userId: c.id, category, email: category !== "TICKETS", inApp: true },
      });
    }
  }
}

async function seedServices(): Promise<void> {
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
  const list = [
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
  for (const s of list) await prisma.service.upsert({ where: { id: s.id }, update: {}, create: s });
}

interface CaseSeed {
  number: number;
  client: string;
  stageIdx: number;
  status: string;
  service?: string;
  priority?: string;
  deadline: number;
  createdAgo: number;
  completedAgo?: number;
  last: [number, number?];
  owner: string;
  filing?: string;
}

const CASES: CaseSeed[] = [
  { number: 118, client: "c42", stageIdx: 3, status: "Awaiting Client", priority: "High", deadline: 9, createdAgo: 24, last: [-1, 16], owner: "u5" },
  { number: 114, client: "c43", stageIdx: 4, status: "Active", deadline: 14, createdAgo: 30, last: [-2, 14], owner: "u5" },
  { number: 119, client: "c47", stageIdx: 6, status: "Active", priority: "High", deadline: -1, createdAgo: 38, last: [-4, 10], owner: "u6" },
  { number: 122, client: "c49", stageIdx: 8, status: "Active", deadline: 6, createdAgo: 52, last: [0, 8], owner: "u6", filing: "TX-DEMO-5521" },
  { number: 101, client: "c31", stageIdx: 10, status: "Completed", deadline: -150, createdAgo: 178, completedAgo: 152, last: [-152], owner: "u5", filing: "WY-DEMO-2210" },
  { number: 104, client: "c34", stageIdx: 10, status: "Completed", deadline: -110, createdAgo: 140, completedAgo: 118, last: [-118], owner: "u6", filing: "DE-DEMO-7781" },
  { number: 106, client: "c36", stageIdx: 10, status: "Completed", priority: "Low", deadline: -70, createdAgo: 98, completedAgo: 64, last: [-64], owner: "u5", filing: "NM-DEMO-0311" },
  { number: 108, client: "c38", stageIdx: 10, status: "Completed", deadline: -30, createdAgo: 61, completedAgo: 27, last: [-27], owner: "u6", filing: "FL-DEMO-4410" },
  { number: 110, client: "c40", stageIdx: 10, status: "Completed", deadline: -10, createdAgo: 44, completedAgo: 12, last: [-12], owner: "u5", filing: "TX-DEMO-8802" },
  { number: 123, client: "c45", stageIdx: 5, status: "Active", service: "corp", priority: "Urgent", deadline: 2, createdAgo: 21, last: [-1, 15], owner: "u5" },
  { number: 124, client: "c46", stageIdx: 2, status: "Blocked", deadline: 11, createdAgo: 9, last: [-4, 11], owner: "u6" },
];

/** Case row id for a PRJ number. */
const caseId = (n: number): string => `seed-case-${n}`;

async function seedCases(): Promise<void> {
  for (const c of CASES) {
    await prisma.case.upsert({
      where: { number: c.number },
      update: {},
      create: {
        id: caseId(c.number),
        number: c.number,
        clientId: c.client,
        serviceId: c.service ?? "llc",
        stage: STAGES[c.stageIdx],
        status: enumKey(c.status) as Prisma.CaseCreateInput["status"],
        priority: priority(c.priority ?? "Normal"),
        deadline: dateOn(c.deadline),
        filingConfirmation: c.filing ?? "",
        ownerId: c.owner,
        completedAt: c.completedAgo === undefined ? null : at(-c.completedAgo),
        lastActivityAt: at(c.last[0], c.last[1] ?? 10),
        createdAt: at(-c.createdAgo),
      },
    });
  }

  const events: Array<[number, CaseStage, string, number, string]> = [
    [118, "DOCUMENTS_PENDING", "u5", -6, "Proof of address requested"],
    [114, "DOCUMENTS_UNDER_REVIEW", "u5", -2, ""],
    [119, "STATE_FILING_IN_PROGRESS", "u2", -8, "Articles submitted to Florida"],
    [122, "EIN_PROCESSING", "u2", -3, "State approval TX-DEMO-5521 recorded"],
    [123, "READY_FOR_FILING", "u5", -1, ""],
    [124, "INFORMATION_REQUIRED", "u4", -4, "Member addresses missing"],
  ];
  for (const c of CASES.filter((x) => x.completedAgo !== undefined)) {
    events.push([c.number, "COMPLETED", "u2", -(c.completedAgo ?? 0), "Post-formation package delivered"]);
  }
  for (const [n, stage, by, days, note] of events) {
    const id = `seed-ce-${n}-${stage}`;
    await prisma.caseEvent.upsert({ where: { id }, update: {}, create: { id, caseId: caseId(n), toStage: stage, byId: by, note, at: at(days, 11) } });
  }

  const notes: Array<[number, number, string, "STAFF" | "COMPLIANCE", string, number, number]> = [
    [118, 1, "u3", "STAFF", "Alex prefers portal messages over calls.", -5, 9],
    [118, 2, "u5", "COMPLIANCE", "Utility bill rejected: older than 3 months. Bank statement acceptable if dated after July.", -3, 15],
    [119, 3, "u6", "COMPLIANCE", "Florida queue is running long; re-check on the next business day.", -2, 10],
  ];
  for (const [n, k, by, visibility, text, days, hour] of notes) {
    const id = `seed-cn-${k}`;
    await prisma.caseNote.upsert({ where: { id }, update: {}, create: { id, caseId: caseId(n), authorId: by, visibility, text, createdAt: at(days, hour) } });
  }
}

async function seedTasks(): Promise<void> {
  type T = { id: number; n: number; title: string; type: "COMPLIANCE" | "CSR_FOLLOW_UP" | "OPERATIONS"; by: string; assignee: string; due: number; priority?: string; vis?: "INTERNAL" | "CLIENT"; doneAgo?: [number, number] };
  const tasks: T[] = [
    { id: 2, n: 118, title: "Call Alex about ownership percentages", type: "CSR_FOLLOW_UP", by: "u3", assignee: "u3", due: 1 },
    { id: 3, n: 114, title: "Review member information form", type: "COMPLIANCE", by: "u5", assignee: "u5", due: 0, priority: "High" },
    { id: 4, n: 122, title: "Submit EIN application", type: "OPERATIONS", by: "u2", assignee: "u2", due: 2 },
    { id: 5, n: 119, title: "Check Florida filing status with the state portal", type: "COMPLIANCE", by: "u6", assignee: "u6", due: -2, priority: "High" },
    { id: 6, n: 118, title: "Prepare operating agreement draft", type: "OPERATIONS", by: "u2", assignee: "u2", due: 3 },
    { id: 7, n: 123, title: "Prepare Delaware certificate of incorporation", type: "OPERATIONS", by: "u2", assignee: "u1", due: 0, priority: "Urgent" },
    { id: 8, n: 124, title: "Call Aisha about member home addresses", type: "CSR_FOLLOW_UP", by: "u4", assignee: "u4", due: -1 },
    { id: 9, n: 122, title: "Send EIN confirmation letter to client", type: "OPERATIONS", by: "u2", assignee: "u4", due: 5, vis: "CLIENT" },
    { id: 10, n: 114, title: "Verify member information form", type: "COMPLIANCE", by: "u6", assignee: "u6", due: -3, doneAgo: [-3, 15] },
    { id: 11, n: 110, title: "Deliver post-formation package", type: "OPERATIONS", by: "u2", assignee: "u2", due: -12, doneAgo: [-12, 16] },
    { id: 12, n: 108, title: "Confirm registered agent acceptance", type: "COMPLIANCE", by: "u5", assignee: "u5", due: -30, doneAgo: [-31, 11] },
  ];
  for (const t of tasks) {
    const id = `seed-task-${t.id}`;
    await prisma.task.upsert({
      where: { id },
      update: {},
      create: {
        id,
        caseId: caseId(t.n),
        title: t.title,
        type: t.type,
        visibility: t.vis ?? "INTERNAL",
        done: Boolean(t.doneAgo),
        priority: priority(t.priority ?? "Normal"),
        due: dateOn(t.due),
        createdById: t.by,
        assigneeId: t.assignee,
        completedById: t.doneAgo ? t.assignee : null,
        completedAt: t.doneAgo ? at(t.doneAgo[0], t.doneAgo[1]) : null,
        createdAt: at(-4),
      },
    });
  }
}

interface DocSeed {
  id: number;
  client: string;
  name: string;
  file: string;
  type: string;
  status: DocStatus;
  reason?: string;
  /** Days from today the client submitted, or null if they have not. */
  submitted: number | null;
  /** Days from today a reviewer decided, or null. */
  reviewed: number | null;
  reviewer?: string;
  requestedBy?: string;
}

async function seedDocuments(): Promise<void> {
  const D = (id: number, client: string, name: string, type: string, status: DocStatus, submitted: number | null, reviewed: number | null, reviewer?: string, reason = "", requestedBy = "u5"): DocSeed => ({
    id, client, name, file: submitted === null && status !== "SHARED" ? "" : `${name}.pdf`, type, status, reason, submitted, reviewed, reviewer, requestedBy,
  });
  const docs: DocSeed[] = [
    D(11, "c42", "Passport", "Identity", "APPROVED", -20, -19, "u5"),
    D(12, "c42", "Utility bill (Aug 2026)", "Address", "REJECTED", -12, -10, "u5", "Older than 3 months"),
    D(13, "c42", "Proof of address (updated)", "Address", "REQUESTED", null, null),
    D(14, "c42", "Registered agent consent", "Formation", "SUBMITTED", -2, null),
    D(15, "c43", "Passport", "Identity", "SUBMITTED", -1, null),
    D(16, "c47", "Articles of Organization (filed copy)", "Formation", "SHARED", null, null),
    D(17, "c49", "SS-4 responsible party details", "Tax", "SUBMITTED", -1, null),
    D(30, "c31", "Passport", "Identity", "APPROVED", -170, -169, "u5"),
    D(31, "c34", "Passport", "Identity", "APPROVED", -133, -131, "u6"),
    D(32, "c36", "Driver's license", "Identity", "APPROVED", -90, -90, "u5"),
    D(33, "c38", "Passport", "Identity", "APPROVED", -55, -53, "u6"),
    D(34, "c40", "Passport", "Identity", "APPROVED", -40, -39, "u5"),
    D(35, "c40", "Proof of address", "Address", "APPROVED", -38, -37, "u6"),
    D(36, "c45", "Passport", "Identity", "APPROVED", -18, -17, "u5"),
    D(37, "c45", "Share structure worksheet", "Formation", "APPROVED", -9, -7, "u6"),
    D(38, "c46", "Member home addresses", "Address", "REQUESTED", null, null, undefined, "", "u6"),
  ];
  for (const d of docs) {
    const id = `seed-doc-${d.id}`;
    const submittedAt = d.submitted === null ? null : at(d.submitted, 14);
    const reviewedAt = d.reviewed === null ? null : at(d.reviewed, 11);
    const requestedAt = at((d.submitted ?? -6) - 2);
    await prisma.document.upsert({
      where: { id },
      update: {},
      create: {
        id,
        clientId: d.client,
        name: d.name,
        type: enumKey(d.type) as DocType,
        status: d.status,
        fileName: d.file,
        reason: d.reason ?? "",
        requestedById: d.status === "SHARED" ? null : d.requestedBy,
        reviewedById: d.reviewer ?? null,
        requestedAt,
        submittedAt,
        reviewedAt,
      },
    });
    const history: Array<{ status: DocStatus; by: string; at: Date; note: string }> = [];
    if (d.status === "SHARED") {
      history.push({ status: "SHARED", by: "u1", at: at(-8, 14), note: "" });
    } else {
      history.push({ status: "REQUESTED", by: d.requestedBy ?? "u5", at: requestedAt, note: "" });
      if (submittedAt) history.push({ status: "SUBMITTED", by: d.client, at: submittedAt, note: d.file });
      if (reviewedAt && d.reviewer) history.push({ status: d.status, by: d.reviewer, at: reviewedAt, note: d.reason ?? "" });
    }
    for (const [i, h] of history.entries()) {
      const eid = `${id}-ev${i}`;
      await prisma.documentEvent.upsert({ where: { id: eid }, update: {}, create: { id: eid, documentId: id, status: h.status, byId: h.by, note: h.note, at: h.at } });
    }
  }
}

async function seedMessages(): Promise<void> {
  type M = [string, string, number, number];
  const threads: Record<string, M[]> = {
    c42: [["u5", "We've requested an updated proof of address dated after July 2026.", -6, 9], ["c42", "Thanks, I'll upload a bank statement this week.", -6, 11], ["u3", "Perfect, Alex. I'll watch for it.", -6, 12]],
    c43: [["c43", "I've uploaded my passport. My partner's will follow.", -5, 18]],
    c47: [["u1", "Your Articles were submitted to Florida on Oct 9.", -12, 14], ["c47", "Any update from the state on the filing?", -8, 10]],
    c49: [["c49", "Do you need anything else for the EIN?", -4, 8]],
    c45: [["c45", "Is the Delaware certificate ready to file?", -1, 15]],
    c46: [["u4", "Could you send the home addresses for both members?", -4, 11]],
  };
  const created: Record<string, Date[]> = {};
  for (const [client, list] of Object.entries(threads)) {
    created[client] = [];
    for (const [i, [from, text, days, hour]] of list.entries()) {
      const id = `seed-msg-${client}-${i}`;
      const when = at(days, hour);
      created[client].push(when);
      await prisma.message.upsert({ where: { id }, update: {}, create: { id, clientId: client, senderId: from, text, createdAt: when } });
    }
  }
  // How many messages each person had read in the prototype; 0 means nothing read yet.
  const lastRead: Record<string, Record<string, number>> = {
    u1: { c42: 3, c47: 1 },
    u2: { c42: 3, c43: 1, c47: 2 },
    u3: { c42: 3, c47: 1 },
    u4: { c43: 0, c49: 0 },
    u5: { c42: 3, c47: 2 },
    c42: { c42: 2 },
    c43: { c43: 1 },
    c47: { c47: 2 },
    c49: { c49: 1 },
  };
  for (const [user, perClient] of Object.entries(lastRead)) {
    for (const [client, count] of Object.entries(perClient)) {
      const readUpTo = count === 0 ? new Date(0) : (created[client]?.[count - 1] ?? new Date(0));
      await prisma.conversationRead.upsert({ where: { userId_clientId: { userId: user, clientId: client } }, update: {}, create: { userId: user, clientId: client, readUpTo } });
    }
  }
}

async function seedReports(): Promise<void> {
  type R = { number: number; client: string; csr: string; case: number; title: string; body: string; category: ReportCategory; priority: string; action: string; status: ReportStatus; created: [number, number]; thread: Array<[string, string, number, number]>; notes: Array<[string, string, number, number]>; events: Array<[ReportStatus, string, number, number]> };
  const reports: R[] = [
    { number: 200, client: "c43", csr: "u4", case: 114, title: "ITIN not available", body: "Sarah doesn't have an ITIN and asked whether the EIN can still be filed.", category: "TAX_EIN_QUESTION", priority: "Normal", action: "Confirm EIN route for a client without an ITIN", status: "REVIEWED", created: [-3, 10], thread: [["u5", "Yes. We'll use the foreign-owner route; I've added a compliance task.", -3, 14]], notes: [["u5", "Paper SS-4 route.", -3, 14]], events: [["SUBMITTED", "u4", -3, 10], ["ACKNOWLEDGED", "u5", -3, 11], ["REVIEWED", "u5", -3, 14]] },
    { number: 201, client: "c42", csr: "u3", case: 118, title: "Proof of address will be a bank statement", body: "Alex will upload a September bank statement instead of a utility bill. Is that acceptable?", category: "DOCUMENT_QUESTION", priority: "Normal", action: "Confirm a bank statement is acceptable proof of address", status: "SUBMITTED", created: [-1, 16], thread: [], notes: [], events: [["SUBMITTED", "u3", -1, 16]] },
    { number: 199, client: "c47", csr: "u3", case: 119, title: "Client asking about Florida delay", body: "Michael is worried the filing is taking longer than he was told.", category: "CLIENT_CONCERN", priority: "High", action: "Advise what we can tell the client about state timing", status: "ACKNOWLEDGED", created: [-2, 12], thread: [["u6", "Acknowledged. I'll check the state queue and reply today.", -2, 15]], notes: [], events: [["SUBMITTED", "u3", -2, 12], ["ACKNOWLEDGED", "u6", -2, 15]] },
  ];
  for (const r of reports) {
    const id = `seed-rpt-${r.number}`;
    await prisma.report.upsert({
      where: { number: r.number },
      update: {},
      create: { id, number: r.number, clientId: r.client, csrId: r.csr, caseId: caseId(r.case), title: r.title, body: r.body, category: r.category, priority: priority(r.priority), action: r.action, status: r.status, createdAt: at(r.created[0], r.created[1]) },
    });
    const rows: Array<[string, boolean, [string, string, number, number]]> = [...r.thread.map((t, i): [string, boolean, [string, string, number, number]] => [`${id}-m${i}`, false, t]), ...r.notes.map((t, i): [string, boolean, [string, string, number, number]] => [`${id}-n${i}`, true, t])];
    for (const [mid, isNote, [from, text, days, hour]] of rows) {
      await prisma.reportMessage.upsert({ where: { id: mid }, update: {}, create: { id: mid, reportId: id, authorId: from, text, isNote, createdAt: at(days, hour) } });
    }
    for (const [i, [status, by, days, hour]] of r.events.entries()) {
      const eid = `${id}-e${i}`;
      await prisma.reportEvent.upsert({ where: { id: eid }, update: {}, create: { id: eid, reportId: id, status, byId: by, at: at(days, hour) } });
    }
  }
}

async function seedAnnouncements(): Promise<void> {
  type A = { id: number; title: string; message: string; audience: string | null; prio: AnnouncementPriority; status: "DRAFT" | "PUBLISHED"; by: string; ack: boolean; published: number | null; exp: string | null };
  const list: A[] = [
    { id: 1, title: "Office closed on October 24", message: "Messages sent that day will be answered on October 26.", audience: null, prio: "NORMAL", status: "PUBLISHED", by: "u1", ack: false, published: -8, exp: null },
    { id: 2, title: "Updated proof-of-address requirement", message: "Proof of address must be dated within the last 3 months.", audience: "c42", prio: "IMPORTANT", status: "PUBLISHED", by: "u5", ack: true, published: -7, exp: "2026-10-22" },
    { id: 3, title: "Wyoming annual report reminders", message: "Wyoming LLCs file an annual report every year. We'll remind you ahead of your date.", audience: null, prio: "NORMAL", status: "DRAFT", by: "u2", ack: false, published: null, exp: null },
  ];
  for (const a of list) {
    const id = `seed-ann-${a.id}`;
    await prisma.announcement.upsert({
      where: { id },
      update: {},
      create: { id, title: a.title, message: a.message, audienceId: a.audience, priority: a.prio, status: a.status, requireAck: a.ack, createdById: a.by, publishedAt: a.published === null ? null : at(a.published), expiresAt: a.exp ? new Date(`${a.exp}T00:00:00.000Z`) : null },
    });
  }
}

async function seedTickets(): Promise<void> {
  type Ev = [string, string, string, number, number, string];
  type T = { number: number; client: string; project: number; title: string; category: string; priority: string; status: string; handler: string; created: [number, number]; desc: string; resolved?: { by: string; days: number; hour: number; note: string }; thread: Array<[string, string, number, number, boolean]>; events: Ev[] };
  const tickets: T[] = [
    { number: 1001, client: "c47", project: 119, title: "Formation is taking longer than expected", category: "Formation delay", priority: "High", status: "In Progress", handler: "u3", created: [-4, 10], desc: "It's been over a week since filing. What's happening?", thread: [["u3", "The state hasn't responded yet. I'll update you as soon as it does.", -4, 11, false]], events: [["", "Open", "c47", -4, 10, "Ticket created"], ["Open", "In Progress", "u3", -4, 11, ""]] },
    { number: 1002, client: "c42", project: 118, title: "Wrong middle name on draft Articles", category: "Incorrect client information", priority: "Normal", status: "Waiting for Internal Team", handler: "u5", created: [-1, 10], desc: "The draft spells my middle name as Jamse instead of James.", thread: [["u5", "Thanks Alex, we'll correct it in draft v3.", -1, 10, false], ["u5", "Check passport spelling before v3.", -1, 10, true]], events: [["", "Open", "c42", -1, 9, "Ticket created"], ["Open", "Waiting for Internal Team", "u5", -1, 10, "Correction queued for draft v3"]] },
    { number: 1003, client: "c49", project: 122, title: "Portal upload failed twice", category: "Technical problem", priority: "Normal", status: "Resolved", handler: "u2", created: [-2, 10], desc: "My PDF upload keeps failing.", resolved: { by: "u2", days: -2, hour: 15, note: "File was over the size limit; a compressed PDF uploaded fine." }, thread: [["u2", "Your file was over 25 MB. Compressing it should fix this.", -2, 14, false]], events: [["", "Open", "c49", -2, 13, "Ticket created"], ["Open", "Resolved", "u2", -2, 15, "File was over the size limit; a compressed PDF uploaded fine."]] },
    { number: 998, client: "c40", project: 110, title: "Where is my formation certificate?", category: "General service request", priority: "Normal", status: "Closed", handler: "u3", created: [-15, 10], desc: "I can't find the certificate in my documents.", resolved: { by: "u3", days: -14, hour: 16, note: "Shared the filed certificate in Documents." }, thread: [["u3", "I've shared it in your Documents page.", -14, 16, false]], events: [["", "Open", "c40", -15, 10, "Ticket created"], ["Open", "Resolved", "u3", -14, 16, "Shared the filed certificate in Documents."], ["Resolved", "Closed", "c40", -13, 9, "Client confirmed the issue is resolved"]] },
  ];
  for (const t of tickets) {
    const id = `seed-tkt-${t.number}`;
    await prisma.ticket.upsert({
      where: { number: t.number },
      update: {},
      create: {
        id,
        number: t.number,
        clientId: t.client,
        caseId: caseId(t.project),
        title: t.title,
        category: TICKET_CATEGORY[t.category],
        priority: priority(t.priority),
        status: ticketStatus(t.status),
        handlerId: t.handler,
        description: t.desc,
        resolutionNote: t.resolved?.note ?? "",
        resolvedById: t.resolved?.by ?? null,
        resolvedAt: t.resolved ? at(t.resolved.days, t.resolved.hour) : null,
        createdAt: at(t.created[0], t.created[1]),
      },
    });
    for (const [i, [from, text, days, hour, internal]] of t.thread.entries()) {
      const mid = `${id}-m${i}`;
      await prisma.ticketMessage.upsert({ where: { id: mid }, update: {}, create: { id: mid, ticketId: id, authorId: from, text, internal, createdAt: at(days, hour) } });
    }
    for (const [i, [from, to, by, days, hour, note]] of t.events.entries()) {
      const eid = `${id}-e${i}`;
      await prisma.ticketEvent.upsert({ where: { id: eid }, update: {}, create: { id: eid, ticketId: id, fromStatus: from ? ticketStatus(from) : null, toStatus: ticketStatus(to), byId: by, note, at: at(days, hour) } });
    }
  }
}

async function seedWork(): Promise<void> {
  const followups: Array<[number, string, string, string, number, boolean, string, string?, [number, number]?]> = [
    [1, "c42", "u3", "Portal message", 0, false, "Confirm the bank statement upload"],
    [2, "c47", "u3", "Call", -2, false, "Update Michael on the Florida filing"],
    [3, "c45", "u3", "Email", 2, false, "Explain next steps after filing"],
    [4, "c43", "u4", "Call", 1, false, "Partner's passport timeline"],
    [5, "c46", "u4", "Portal message", -1, false, "Chase member addresses"],
    [6, "c49", "u4", "Email", 4, false, "Share EIN timing"],
    [7, "c42", "u3", "Call", -7, true, "Kick-off call", "Walked through required documents.", [-7, 15]],
    [8, "c40", "u3", "Email", -12, true, "Formation complete", "Sent welcome pack link.", [-12, 17]],
    [9, "c49", "u4", "Call", -5, true, "EIN questions", "Answered SS-4 questions.", [-5, 12]],
  ];
  for (const [n, client, csr, type, due, done, note, outcome, doneAt] of followups) {
    const id = `seed-fu-${n}`;
    await prisma.followUp.upsert({
      where: { id },
      update: {},
      create: { id, clientId: client, csrId: csr, type: interaction(type), due: dateOn(due), status: done ? "DONE" : "OPEN", note, outcome: outcome ?? "", doneAt: doneAt ? at(doneAt[0], doneAt[1]) : null, createdAt: at(due - 2) },
    });
  }
  const interactions: Array<[number, string, string, string, string, number, number]> = [
    [1, "c42", "u3", "Call", "Discussed acceptable proof-of-address documents.", -7, 15],
    [2, "c47", "u3", "Email", "Shared that Florida typically confirms by email; no action needed from client.", -4, 9],
    [3, "c46", "u4", "Portal message", "Requested member home addresses.", -4, 11],
  ];
  for (const [n, client, by, kind, text, days, hour] of interactions) {
    const id = `seed-int-${n}`;
    await prisma.interaction.upsert({ where: { id }, update: {}, create: { id, clientId: client, byId: by, kind: interaction(kind), text, at: at(days, hour) } });
  }
  const filings: Array<[number, number, string, number | null, FilingStatus, string, string, number | null, string]> = [
    [1, 119, "Articles of Organization", -8, "PENDING_STATE_REVIEW", "", "Check state portal", 0, ""],
    [2, 122, "Certificate of Formation", -20, "APPROVED", "TX-DEMO-5521", "Submit SS-4 for EIN", 2, "Approved"],
    [3, 122, "EIN application (SS-4)", null, "NOT_SUBMITTED", "", "Prepare SS-4", 2, ""],
    [4, 123, "Certificate of Incorporation", null, "NOT_SUBMITTED", "", "File once client signs", 1, ""],
    [5, 110, "Certificate of Formation", -30, "APPROVED", "TX-DEMO-8802", "", null, "Approved"],
    [6, 108, "Articles of Organization", -45, "APPROVED", "FL-DEMO-4410", "", null, "Approved"],
  ];
  for (const [n, project, type, submitted, status, reference, next, nextDate, outcome] of filings) {
    await prisma.filing.upsert({
      where: { number: n },
      update: {},
      create: { id: `seed-fil-${n}`, number: n, caseId: caseId(project), type, submittedOn: submitted === null ? null : dateOn(submitted), status, reference, nextAction: next, nextActionDate: nextDate === null ? null : dateOn(nextDate), outcome },
    });
  }
  const reminders: Array<[number, number, string, number]> = [
    [1, 101, "Annual report reminder — Lee Botanicals LLC (Wyoming)", 20],
    [2, 104, "Annual report reminder — Oyelaran Freight LLC (Delaware)", 34],
    [3, 106, "Annual report reminder — Okafor Consulting LLC (New Mexico)", -3],
  ];
  for (const [n, project, title, days] of reminders) {
    const id = `seed-rem-${n}`;
    await prisma.reminder.upsert({ where: { id }, update: {}, create: { id, caseId: caseId(project), title, date: dateOn(days), kind: "Annual report", illustrative: true } });
  }
}

async function seedSystem(): Promise<void> {
  const triggers = [
    { key: "inv", name: "Client invited", template: "Invitation v3", templateOptions: ["Invitation v3", "Invitation (plain)"], security: false },
    { key: "msg", name: "New client message", template: "Message waiting", templateOptions: ["Message waiting"], security: false },
    { key: "ticket", name: "Ticket status changed", template: "Ticket update", templateOptions: ["Ticket update", "Ticket update (short)"], security: false },
    { key: "docreq", name: "Document requested", template: "Document request", templateOptions: ["Document request"], security: false },
    { key: "sec", name: "Security event", template: "Security alert", templateOptions: ["Security alert"], security: true },
  ];
  for (const t of triggers) await prisma.notificationTrigger.upsert({ where: { key: t.key }, update: {}, create: { ...t, enabled: true } });

  const notifications: Array<[string, number, string, string, number, number, boolean]> = [
    ["c42", 1, "Document requested: Proof of address (updated)", "cdocs", -1, 10, true],
    ["u3", 1, "New message from Alex Morgan", "messages", -1, 10, false],
    ["u5", 1, "CSR report RPT-201 from John Smith", "reports", -1, 10, true],
    ["u1", 1, "TKT-1001 is marked High priority", "tickets", -4, 10, true],
    ["u1", 2, "Task overdue: Check Florida filing status", "tasks", -1, 9, true],
    ["u1", 3, "Ravi Patel's formation was completed", "cases", -12, 16, false],
    ["u2", 1, "3 documents are waiting for review", "documents", 0, 8, true],
    ["u4", 1, "Follow-up overdue: Aisha Rahman", "followups", 0, 8, true],
    ["u6", 1, "Report RPT-199 needs a reply", "reports", -2, 12, true],
  ];
  for (const [user, n, text, link, days, hour, unread] of notifications) {
    const id = `seed-notif-${user}-${n}`;
    await prisma.notification.upsert({ where: { id }, update: {}, create: { id, userId: user, text, link, readAt: unread ? null : at(days, hour + 1), createdAt: at(days, hour) } });
  }

  const audit: Array<[string, string, string, boolean, number, number]> = [
    ["u3", "Submitted report RPT-201", "CASE-2026-0042", true, -1, 10],
    ["u5", "Changed TKT-1002 to Waiting for Internal Team", "CASE-2026-0042", true, -2, 10],
    ["u2", "Resolved TKT-1003", "CASE-2026-0049", true, -3, 10],
    ["u5", "Requested document: Proof of address (updated)", "CASE-2026-0042", true, -4, 10],
    ["u2", "Invited client Tomás Rivera", "CASE-2026-0053", true, -5, 10],
    ["u2", "Moved PRJ-110 to Completed", "CASE-2026-0040", true, -12, 16],
    ["u3", "Refused: Download Passport (Ravi Patel).pdf", "CASE-2026-0040", false, -14, 9],
  ];
  for (const [i, [actor, action, target, ok, days, hour]] of audit.entries()) {
    const id = `seed-audit-${i + 1}`;
    await prisma.auditLog.upsert({
      where: { id },
      update: {},
      create: { id, actorId: actor, actorRole: ROLE_OF[actor], action, target, ok, category: ok ? "" : "docs", createdAt: at(days, hour) },
    });
  }

  // Counters hold the last number issued; the next one is value + 1. Existing counters are never reset.
  const counters: Array<[string, number]> = [
    ["case", 126],
    ["client", 53],
    ["ticket", 1003],
    ["report", 201],
    ["filing", 9],
  ];
  for (const [key, value] of counters) await prisma.counter.upsert({ where: { key }, update: {}, create: { key, value } });
}

/** Demo data and a shared demo password must never land in a production database by accident. */
function assertSeedingAllowed(): void {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    throw new Error(
      "Refusing to seed: NODE_ENV is production. Seeding writes demo accounts with a shared password. " +
        "If you really mean it, run again with ALLOW_PROD_SEED=true.",
    );
  }
}

async function main(): Promise<void> {
  assertSeedingAllowed();
  const passwordHash = await argon2.hash(requireSeedPassword(), { type: argon2.argon2id });
  await seedCompany();
  await seedUsers(passwordHash);
  await seedServices();
  await seedCases();
  await seedTasks();
  await seedDocuments();
  await seedMessages();
  await seedReports();
  await seedAnnouncements();
  await seedTickets();
  await seedWork();
  await seedSystem();
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
