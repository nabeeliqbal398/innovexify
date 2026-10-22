import { atOff, dISO, fmtAt } from "@/lib/dates";
import type {
  Announcement,
  ClientDoc,
  DemoData,
  Filing,
  FollowUp,
  Interaction,
  Message,
  Project,
  Report,
  Reminder,
  Service,
  Task,
  Ticket,
  Trigger,
  User,
} from "@/types/domain";

const DEFAULT_PREFS = {
  msg: { email: true, app: true },
  docs: { email: true, app: true },
  stage: { email: true, app: true },
  tickets: { email: false, app: true },
  anns: { email: true, app: true },
};

function staff(id: string, name: string, role: User["role"]): User {
  const slug = name.toLowerCase().replace(/\s+/g, ".");
  return { id, name, email: `${slug}@example.com`, role, status: "Active" };
}

function client(
  id: string,
  name: string,
  email: string,
  caseNo: string,
  csr: string | null,
  biz: string,
  state: string,
  extra: Partial<User> = {},
): User {
  return {
    id,
    name,
    email,
    role: "CLIENT",
    status: "Active",
    caseId: `CASE-2026-${caseNo}`,
    csr,
    biz,
    state,
    phone: "",
    address: "",
    contactPref: "Portal message",
    joinedAt: atOff(-40),
    prefs: structuredClone(DEFAULT_PREFS),
    ...extra,
  };
}

function buildUsers(): User[] {
  return [
    staff("u1", "Sarah Bennett", "ADMIN"),
    staff("u2", "Daniel Reyes", "MANAGER"),
    staff("u3", "John Smith", "CSR"),
    staff("u4", "Ayesha Khan", "CSR"),
    staff("u5", "Maya Chen", "COMPLIANCE"),
    staff("u6", "Omar Haddad", "COMPLIANCE"),
    client("c42", "Alex Morgan", "alex.morgan@northfield.co", "0042", "u3", "Northfield Studio LLC", "Wyoming", {
      phone: "+1 307 555 0142",
      address: "1200 Main St, Cheyenne, WY",
      joinedAt: atOff(-24),
    }),
    client("c43", "Sarah Johnson", "sarah@bluewateranalytics.com", "0043", "u4", "Bluewater Analytics LLC", "Delaware"),
    client("c47", "Michael Carter", "michael@cartercoastal.com", "0047", "u3", "Carter Coastal Logistics LLC", "Florida"),
    client("c49", "Emma Wilson", "emma@wilsonridge.co", "0049", "u4", "Wilson Ridge Ventures LLC", "Texas"),
    client("c53", "Tomás Rivera", "tomas@riveraimports.mx", "0053", null, "", "", {
      status: "Invited",
      invitedBy: "u2",
    }),
    client("c31", "Hannah Lee", "hannah@leebotanicals.co", "0031", "u3", "Lee Botanicals LLC", "Wyoming"),
    client("c34", "Marcus Oyelaran", "marcus@oyelaranfreight.com", "0034", "u4", "Oyelaran Freight LLC", "Delaware"),
    client("c36", "Grace Okafor", "grace@okaforconsulting.co", "0036", "u3", "Okafor Consulting LLC", "New Mexico"),
    client("c38", "Ines Moreau", "ines@moreauimports.fr", "0038", "u4", "Moreau Imports LLC", "Florida"),
    client("c40", "Ravi Patel", "ravi@patelanalytics.io", "0040", "u3", "Patel Analytics LLC", "Texas"),
    client("c45", "Noah Becker", "noah@beckerrobotics.com", "0045", "u3", "Becker Robotics Inc.", "Delaware"),
    client("c46", "Aisha Rahman", "aisha@rahmantextiles.com", "0046", "u4", "Rahman Textiles LLC", "Wyoming"),
  ];
}

function buildProjects(): Project[] {
  const base = (p: Partial<Project> & Pick<Project, "id" | "client" | "stageIdx" | "status">): Project => ({
    filing: "",
    service: "llc",
    priority: "Normal",
    deadline: dISO(0),
    createdAt: atOff(-10),
    last: atOff(-1),
    notes: [],
    events: [],
    ...p,
  });
  const projects: Project[] = [
    base({ id: "PRJ-118", client: "c42", stageIdx: 3, status: "Awaiting Client", priority: "High", deadline: dISO(9), createdAt: atOff(-24), last: atOff(-1, 16), owner: "u5" }),
    base({ id: "PRJ-114", client: "c43", stageIdx: 4, status: "Active", deadline: dISO(14), createdAt: atOff(-30), last: atOff(-2, 14), owner: "u5" }),
    base({ id: "PRJ-119", client: "c47", stageIdx: 6, status: "Active", priority: "High", deadline: dISO(-1), createdAt: atOff(-38), last: atOff(-4, 10), owner: "u6" }),
    base({ id: "PRJ-122", client: "c49", stageIdx: 8, status: "Active", deadline: dISO(6), createdAt: atOff(-52), last: atOff(0, 8), owner: "u6", filing: "TX-DEMO-5521" }),
    base({ id: "PRJ-101", client: "c31", stageIdx: 10, status: "Completed", deadline: dISO(-150), createdAt: atOff(-178), completedAt: atOff(-152), last: atOff(-152), owner: "u5", filing: "WY-DEMO-2210" }),
    base({ id: "PRJ-104", client: "c34", stageIdx: 10, status: "Completed", deadline: dISO(-110), createdAt: atOff(-140), completedAt: atOff(-118), last: atOff(-118), owner: "u6", filing: "DE-DEMO-7781" }),
    base({ id: "PRJ-106", client: "c36", stageIdx: 10, status: "Completed", priority: "Low", deadline: dISO(-70), createdAt: atOff(-98), completedAt: atOff(-64), last: atOff(-64), owner: "u5", filing: "NM-DEMO-0311" }),
    base({ id: "PRJ-108", client: "c38", stageIdx: 10, status: "Completed", deadline: dISO(-30), createdAt: atOff(-61), completedAt: atOff(-27), last: atOff(-27), owner: "u6", filing: "FL-DEMO-4410" }),
    base({ id: "PRJ-110", client: "c40", stageIdx: 10, status: "Completed", deadline: dISO(-10), createdAt: atOff(-44), completedAt: atOff(-12), last: atOff(-12), owner: "u5", filing: "TX-DEMO-8802" }),
    base({ id: "PRJ-123", client: "c45", stageIdx: 5, status: "Active", service: "corp", priority: "Urgent", deadline: dISO(2), createdAt: atOff(-21), last: atOff(-1, 15), owner: "u5" }),
    base({ id: "PRJ-124", client: "c46", stageIdx: 2, status: "Blocked", deadline: dISO(11), createdAt: atOff(-9), last: atOff(-4, 11), owner: "u6" }),
  ];

  const event = (pid: string, to: string, by: string, days: number, note = ""): void => {
    projects.find((p) => p.id === pid)?.events.push({ to, by, at: atOff(days, 11), note });
  };
  event("PRJ-118", "Documents Pending", "u5", -6, "Proof of address requested");
  event("PRJ-114", "Documents Under Review", "u5", -2);
  event("PRJ-119", "State Filing in Progress", "u2", -8, "Articles submitted to Florida");
  event("PRJ-122", "EIN Processing", "u2", -3, "State approval TX-DEMO-5521 recorded");
  event("PRJ-123", "Ready for Filing", "u5", -1);
  event("PRJ-124", "Information Required", "u4", -4, "Member addresses missing");
  projects
    .filter((p) => p.completedAt)
    .forEach((p) =>
      p.events.push({ to: "Completed", by: "u2", at: p.completedAt ?? 0, note: "Post-formation package delivered" }),
    );

  const byId = (id: string): Project => projects.find((p) => p.id === id) as Project;
  byId("PRJ-118").notes = [
    { id: 1, by: "u3", vis: "staff", text: "Alex prefers portal messages over calls.", at: atOff(-5, 9) },
    {
      id: 2,
      by: "u5",
      vis: "compliance",
      text: "Utility bill rejected: older than 3 months. Bank statement acceptable if dated after July.",
      at: atOff(-3, 15),
    },
  ];
  byId("PRJ-119").notes = [
    {
      id: 3,
      by: "u6",
      vis: "compliance",
      text: "Florida queue is running long; re-check on the next business day.",
      at: atOff(-2, 10),
    },
  ];
  return projects;
}

function buildTasks(): Task[] {
  const task = (t: Partial<Task> & Pick<Task, "id" | "project" | "title" | "type" | "by" | "assignee" | "due">): Task => ({
    vis: "internal",
    done: false,
    priority: "Normal",
    createdAt: atOff(-4),
    ...t,
  });
  return [
    task({ id: 2, project: "PRJ-118", title: "Call Alex about ownership percentages", type: "CSR follow-up", by: "u3", assignee: "u3", due: dISO(1), createdAt: atOff(-5) }),
    task({ id: 3, project: "PRJ-114", title: "Review member information form", type: "Compliance", by: "u5", assignee: "u5", due: dISO(0), priority: "High", createdAt: atOff(-5) }),
    task({ id: 4, project: "PRJ-122", title: "Submit EIN application", type: "Operations", by: "u2", assignee: "u2", due: dISO(2), createdAt: atOff(-5) }),
    task({ id: 5, project: "PRJ-119", title: "Check Florida filing status with the state portal", type: "Compliance", by: "u6", assignee: "u6", due: dISO(-2), priority: "High" }),
    task({ id: 6, project: "PRJ-118", title: "Prepare operating agreement draft", type: "Operations", by: "u2", assignee: "u2", due: dISO(3) }),
    task({ id: 7, project: "PRJ-123", title: "Prepare Delaware certificate of incorporation", type: "Operations", by: "u2", assignee: "u1", due: dISO(0), priority: "Urgent" }),
    task({ id: 8, project: "PRJ-124", title: "Call Aisha about member home addresses", type: "CSR follow-up", by: "u4", assignee: "u4", due: dISO(-1) }),
    task({ id: 9, project: "PRJ-122", title: "Send EIN confirmation letter to client", type: "Operations", by: "u2", assignee: "u4", due: dISO(5), vis: "client" }),
    task({ id: 10, project: "PRJ-114", title: "Verify member information form", type: "Compliance", by: "u6", assignee: "u6", due: dISO(-3), done: true, completedAt: atOff(-3, 15) }),
    task({ id: 11, project: "PRJ-110", title: "Deliver post-formation package", type: "Operations", by: "u2", assignee: "u2", due: dISO(-12), done: true, completedAt: atOff(-12, 16) }),
    task({ id: 12, project: "PRJ-108", title: "Confirm registered agent acceptance", type: "Compliance", by: "u5", assignee: "u5", due: dISO(-30), done: true, completedAt: atOff(-31, 11) }),
  ];
}

function buildDocs(): ClientDoc[] {
  type Seed = [number, string, string, string, string, ClientDoc["status"], string, number, number, string];
  // id, client, name, file, type, status, reason, submitted offset, reviewed offset (0 = not reviewed), reviewer
  const rows: Seed[] = [
    [11, "c42", "Passport", "Passport (Alex Morgan).pdf", "Identity", "approved", "", -20, -19, "u5"],
    [12, "c42", "Utility bill (Aug 2026)", "Utility bill (Aug 2026).pdf", "Address", "rejected", "Older than 3 months", -12, -10, "u5"],
    [14, "c42", "Registered agent consent", "Registered agent consent.pdf", "Formation", "submitted", "", -2, 0, ""],
    [15, "c43", "Passport", "Passport (Sarah Johnson).pdf", "Identity", "submitted", "", -1, 0, ""],
    [17, "c49", "SS-4 responsible party details", "SS-4 responsible party details.pdf", "Tax", "submitted", "", -1, 0, ""],
  ];
  const docs: ClientDoc[] = rows.map(([id, clientId, name, file, type, status, reason, sub, rev, by]) => {
    const history: ClientDoc["history"] = [
      { status: "requested", by: "u5", at: atOff(sub - 2), note: "" },
      { status: "submitted", by: clientId, at: atOff(sub, 14), note: "" },
    ];
    if (rev) history.push({ status, by, at: atOff(rev, 11), note: reason });
    return {
      id,
      client: clientId,
      name,
      file,
      status,
      reason,
      type,
      requestedAt: atOff(sub - 2),
      submittedAt: atOff(sub, 14),
      reviewedAt: rev ? atOff(rev, 11) : undefined,
      reviewedBy: rev ? by : undefined,
      history,
    };
  });

  docs.push({
    id: 13,
    client: "c42",
    name: "Proof of address (updated)",
    file: "",
    status: "requested",
    reason: "",
    type: "Address",
    requestedAt: atOff(-8),
    requestedBy: "u5",
    history: [{ status: "requested", by: "u5", at: atOff(-8), note: "" }],
  });
  docs.push({
    id: 16,
    client: "c47",
    name: "Articles of Organization (filed copy)",
    file: "Articles of Organization (filed copy).pdf",
    status: "shared",
    reason: "",
    type: "Formation",
    requestedAt: atOff(-10),
    history: [{ status: "shared", by: "u1", at: atOff(-8, 14), note: "" }],
  });

  const added = (
    id: number,
    clientId: string,
    name: string,
    type: string,
    sub: number,
    rev: number,
    by: string,
  ): void => {
    docs.push({
      id,
      client: clientId,
      name,
      file: `${name}.pdf`,
      status: "approved",
      reason: "",
      type,
      requestedAt: atOff(sub - 2),
      submittedAt: atOff(sub, 10),
      reviewedAt: atOff(rev, 15),
      reviewedBy: by,
      history: [
        { status: "requested", by: "u5", at: atOff(sub - 2), note: "" },
        { status: "submitted", by: clientId, at: atOff(sub, 10), note: "" },
        { status: "approved", by, at: atOff(rev, 15), note: "" },
      ],
    });
  };
  added(30, "c31", "Passport", "Identity", -170, -169, "u5");
  added(31, "c34", "Passport", "Identity", -133, -131, "u6");
  added(32, "c36", "Driver's license", "Identity", -90, -90, "u5");
  added(33, "c38", "Passport", "Identity", -55, -53, "u6");
  added(34, "c40", "Passport", "Identity", -40, -39, "u5");
  added(35, "c40", "Proof of address", "Address", -38, -37, "u6");
  added(36, "c45", "Passport", "Identity", -18, -17, "u5");
  added(37, "c45", "Share structure worksheet", "Formation", -9, -7, "u6");
  docs.push({
    id: 38,
    client: "c46",
    name: "Member home addresses",
    file: "",
    status: "requested",
    reason: "",
    type: "Address",
    requestedAt: atOff(-5),
    requestedBy: "u6",
    history: [{ status: "requested", by: "u6", at: atOff(-5), note: "" }],
  });
  return docs;
}

function buildMessages(): Record<string, Message[]> {
  return {
    c42: [
      { from: "u5", text: "We've requested an updated proof of address dated after July 2026.", time: "15 Oct, 9:00 AM" },
      { from: "c42", text: "Thanks, I'll upload a bank statement this week.", time: "15 Oct, 11:20 AM" },
      { from: "u3", text: "Perfect, Alex. I'll watch for it.", time: "15 Oct, 11:42 AM" },
    ],
    c43: [{ from: "c43", text: "I've uploaded my passport. My partner's will follow.", time: "16 Oct, 6:32 PM" }],
    c47: [
      { from: "u1", text: "Your Articles were submitted to Florida on Oct 9.", time: "9 Oct, 2:45 PM" },
      { from: "c47", text: "Any update from the state on the filing?", time: "13 Oct, 10:00 AM" },
    ],
    c49: [{ from: "c49", text: "Do you need anything else for the EIN?", time: "17 Oct, 8:12 AM" }],
    c53: [],
    c31: [],
    c34: [],
    c36: [],
    c38: [],
    c40: [],
    c45: [
      {
        from: "c45",
        text: "Is the Delaware certificate ready to file?",
        time: fmtAt(atOff(-1, 15)),
        at: atOff(-1, 15),
      },
    ],
    c46: [
      {
        from: "u4",
        text: "Could you send the home addresses for both members?",
        time: fmtAt(atOff(-4, 11)),
        at: atOff(-4, 11),
      },
    ],
  };
}

function buildReports(): Report[] {
  const history = (r: { csr: string; createdAt: number; reviewed: boolean }): Report["history"] => [
    { status: "Submitted", by: r.csr, at: r.createdAt },
    ...(r.reviewed
      ? [
          { status: "Acknowledged", by: "u5", at: r.createdAt + 3_600_000 },
          { status: "Reviewed", by: "u5", at: r.createdAt + 4 * 3_600_000 },
        ]
      : []),
  ];
  return [
    {
      id: "RPT-200",
      client: "c43",
      csr: "u4",
      project: "PRJ-114",
      title: "ITIN not available",
      body: "Sarah doesn't have an ITIN and asked whether the EIN can still be filed.",
      category: "Tax / EIN question",
      priority: "Normal",
      action: "Confirm EIN route for a client without an ITIN",
      status: "Reviewed",
      created: "14 October 2026, 10:05 AM",
      createdAt: atOff(-3, 10),
      thread: [
        {
          from: "u5",
          text: "Yes. We'll use the foreign-owner route; I've added a compliance task.",
          time: "14 October 2026, 2:40 PM",
        },
      ],
      notes: [{ from: "u5", text: "Paper SS-4 route.", time: "14 October 2026, 2:41 PM" }],
      history: history({ csr: "u4", createdAt: atOff(-3, 10), reviewed: true }),
    },
    {
      id: "RPT-201",
      client: "c42",
      csr: "u3",
      project: "PRJ-118",
      title: "Proof of address will be a bank statement",
      body: "Alex will upload a September bank statement instead of a utility bill. Is that acceptable?",
      category: "Document question",
      priority: "Normal",
      action: "Confirm a bank statement is acceptable proof of address",
      status: "Submitted",
      created: "16 October 2026, 4:12 PM",
      createdAt: atOff(-1, 16),
      thread: [],
      notes: [],
      history: history({ csr: "u3", createdAt: atOff(-1, 16), reviewed: false }),
    },
    {
      id: "RPT-199",
      client: "c47",
      csr: "u3",
      project: "PRJ-119",
      title: "Client asking about Florida delay",
      body: "Michael is worried the filing is taking longer than he was told.",
      category: "Client concern",
      priority: "High",
      action: "Advise what we can tell the client about state timing",
      status: "Acknowledged",
      created: fmtAt(atOff(-2, 12)),
      createdAt: atOff(-2, 12),
      thread: [
        {
          from: "u6",
          text: "Acknowledged. I'll check the state queue and reply today.",
          time: fmtAt(atOff(-2, 15)),
        },
      ],
      notes: [],
      history: [
        { status: "Submitted", by: "u3", at: atOff(-2, 12) },
        { status: "Acknowledged", by: "u6", at: atOff(-2, 15) },
      ],
    },
  ];
}

function buildAnnouncements(): Announcement[] {
  return [
    {
      id: 1,
      title: "Office closed on October 24",
      msg: "Messages sent that day will be answered on October 26.",
      aud: "all",
      prio: "Normal",
      status: "Published",
      by: "u1",
      ack: false,
      acks: {},
      date: "13 October 2026",
      exp: "",
    },
    {
      id: 2,
      title: "Updated proof-of-address requirement",
      msg: "Proof of address must be dated within the last 3 months.",
      aud: "c42",
      prio: "Important",
      status: "Published",
      by: "u5",
      ack: true,
      acks: {},
      date: "14 October 2026",
      exp: "2026-10-22",
    },
    {
      id: 3,
      title: "Wyoming annual report reminders",
      msg: "Wyoming LLCs file an annual report every year. We'll remind you ahead of your date.",
      aud: "all",
      prio: "Normal",
      status: "Draft",
      by: "u2",
      ack: false,
      acks: {},
      date: "",
      exp: "",
    },
  ];
}

function buildTickets(): Ticket[] {
  return [
    {
      id: "TKT-1001",
      client: "c47",
      title: "Formation is taking longer than expected",
      category: "Formation delay",
      priority: "High",
      status: "In Progress",
      handler: "u3",
      created: "13 October 2026, 10:04 AM",
      createdAt: atOff(-4, 10),
      updated: "13 October 2026, 11:30 AM",
      desc: "It's been over a week since filing. What's happening?",
      resolution: null,
      escalated: false,
      project: "PRJ-119",
      thread: [
        {
          from: "u3",
          text: "The state hasn't responded yet. I'll update you as soon as it does.",
          time: "13 October 2026, 11:30 AM",
          internal: false,
        },
      ],
      events: [
        { from: "", to: "Open", by: "c47", time: "13 October 2026, 10:04 AM", note: "Ticket created" },
        { from: "Open", to: "In Progress", by: "u3", time: "13 October 2026, 11:30 AM", note: "" },
      ],
    },
    {
      id: "TKT-1002",
      client: "c42",
      title: "Wrong middle name on draft Articles",
      category: "Incorrect client information",
      priority: "Normal",
      status: "Waiting for Internal Team",
      handler: "u5",
      created: "16 October 2026, 9:15 AM",
      createdAt: atOff(-1, 10),
      updated: "16 October 2026, 10:02 AM",
      desc: "The draft spells my middle name as Jamse instead of James.",
      resolution: null,
      escalated: false,
      project: "PRJ-118",
      thread: [
        { from: "u5", text: "Thanks Alex, we'll correct it in draft v3.", time: "16 October 2026, 10:00 AM", internal: false },
        { from: "u5", text: "Check passport spelling before v3.", time: "16 October 2026, 10:02 AM", internal: true },
      ],
      events: [
        { from: "", to: "Open", by: "c42", time: "16 October 2026, 9:15 AM", note: "Ticket created" },
        {
          from: "Open",
          to: "Waiting for Internal Team",
          by: "u5",
          time: "16 October 2026, 10:02 AM",
          note: "Correction queued for draft v3",
        },
      ],
    },
    {
      id: "TKT-1003",
      client: "c49",
      title: "Portal upload failed twice",
      category: "Technical problem",
      priority: "Normal",
      status: "Resolved",
      handler: "u2",
      created: "15 October 2026, 1:20 PM",
      createdAt: atOff(-2, 10),
      updated: "15 October 2026, 3:10 PM",
      desc: "My PDF upload keeps failing.",
      resolution: {
        by: "u2",
        time: "15 October 2026, 3:10 PM",
        at: atOff(-2, 15),
        note: "File was over the size limit; a compressed PDF uploaded fine.",
      },
      escalated: false,
      project: "PRJ-122",
      thread: [
        {
          from: "u2",
          text: "Your file was over 25 MB. Compressing it should fix this.",
          time: "15 October 2026, 2:05 PM",
          internal: false,
        },
      ],
      events: [
        { from: "", to: "Open", by: "c49", time: "15 October 2026, 1:20 PM", note: "Ticket created" },
        {
          from: "Open",
          to: "Resolved",
          by: "u2",
          time: "15 October 2026, 3:10 PM",
          note: "File was over the size limit; a compressed PDF uploaded fine.",
        },
      ],
    },
    {
      id: "TKT-0998",
      client: "c40",
      title: "Where is my formation certificate?",
      category: "General service request",
      priority: "Normal",
      status: "Closed",
      handler: "u3",
      created: fmtAt(atOff(-15, 10)),
      createdAt: atOff(-15, 10),
      updated: fmtAt(atOff(-13, 9)),
      desc: "I can't find the certificate in my documents.",
      resolution: {
        by: "u3",
        time: fmtAt(atOff(-14, 16)),
        at: atOff(-14, 16),
        note: "Shared the filed certificate in Documents.",
      },
      escalated: false,
      project: "PRJ-110",
      thread: [
        { from: "u3", text: "I've shared it in your Documents page.", time: fmtAt(atOff(-14, 16)), internal: false },
      ],
      events: [
        { from: "", to: "Open", by: "c40", time: fmtAt(atOff(-15, 10)), note: "Ticket created" },
        {
          from: "Open",
          to: "Resolved",
          by: "u3",
          time: fmtAt(atOff(-14, 16)),
          note: "Shared the filed certificate in Documents.",
        },
        {
          from: "Resolved",
          to: "Closed",
          by: "c40",
          time: fmtAt(atOff(-13, 9)),
          note: "Client confirmed the issue is resolved",
        },
      ],
    },
  ];
}

function buildTriggers(): Trigger[] {
  return [
    { k: "inv", name: "Client invited", on: true, tpl: "Invitation v3", opts: ["Invitation v3", "Invitation (plain)"] },
    { k: "msg", name: "New client message", on: true, tpl: "Message waiting", opts: ["Message waiting"] },
    { k: "ticket", name: "Ticket status changed", on: true, tpl: "Ticket update", opts: ["Ticket update", "Ticket update (short)"] },
    { k: "docreq", name: "Document requested", on: true, tpl: "Document request", opts: ["Document request"] },
    { k: "sec", name: "Security event", on: true, tpl: "Security alert", opts: ["Security alert"], security: true },
  ];
}

function buildFollowups(): FollowUp[] {
  const f = (x: Omit<FollowUp, "status" | "createdAt"> & Partial<FollowUp> & { createdAt: number }): FollowUp => ({
    status: "Open",
    ...x,
  });
  return [
    f({ id: 1, client: "c42", csr: "u3", type: "Portal message", due: dISO(0), note: "Confirm the bank statement upload", createdAt: atOff(-3) }),
    f({ id: 2, client: "c47", csr: "u3", type: "Call", due: dISO(-2), note: "Update Michael on the Florida filing", createdAt: atOff(-6) }),
    f({ id: 3, client: "c45", csr: "u3", type: "Email", due: dISO(2), note: "Explain next steps after filing", createdAt: atOff(-1) }),
    f({ id: 4, client: "c43", csr: "u4", type: "Call", due: dISO(1), note: "Partner's passport timeline", createdAt: atOff(-2) }),
    f({ id: 5, client: "c46", csr: "u4", type: "Portal message", due: dISO(-1), note: "Chase member addresses", createdAt: atOff(-4) }),
    f({ id: 6, client: "c49", csr: "u4", type: "Email", due: dISO(4), note: "Share EIN timing", createdAt: atOff(-1) }),
    f({ id: 7, client: "c42", csr: "u3", type: "Call", due: dISO(-7), status: "Done", note: "Kick-off call", outcome: "Walked through required documents.", doneAt: atOff(-7, 15), createdAt: atOff(-9) }),
    f({ id: 8, client: "c40", csr: "u3", type: "Email", due: dISO(-12), status: "Done", note: "Formation complete", outcome: "Sent welcome pack link.", doneAt: atOff(-12, 17), createdAt: atOff(-13) }),
    f({ id: 9, client: "c49", csr: "u4", type: "Call", due: dISO(-5), status: "Done", note: "EIN questions", outcome: "Answered SS-4 questions.", doneAt: atOff(-5, 12), createdAt: atOff(-6) }),
  ];
}

function buildInteractions(): Interaction[] {
  return [
    { id: 1, client: "c42", by: "u3", kind: "Call", text: "Discussed acceptable proof-of-address documents.", at: atOff(-7, 15) },
    { id: 2, client: "c47", by: "u3", kind: "Email", text: "Shared that Florida typically confirms by email; no action needed from client.", at: atOff(-4, 9) },
    { id: 3, client: "c46", by: "u4", kind: "Portal message", text: "Requested member home addresses.", at: atOff(-4, 11) },
  ];
}

function buildFilings(): Filing[] {
  return [
    { id: "FIL-1", project: "PRJ-119", type: "Articles of Organization", submitted: dISO(-8), status: "Pending state review", ref: "", updated: atOff(-4, 10), next: "Check state portal", nextDate: dISO(0), outcome: "" },
    { id: "FIL-2", project: "PRJ-122", type: "Certificate of Formation", submitted: dISO(-20), status: "Approved", ref: "TX-DEMO-5521", updated: atOff(-3, 11), next: "Submit SS-4 for EIN", nextDate: dISO(2), outcome: "Approved" },
    { id: "FIL-3", project: "PRJ-122", type: "EIN application (SS-4)", submitted: "", status: "Not submitted", ref: "", updated: atOff(-3, 11), next: "Prepare SS-4", nextDate: dISO(2), outcome: "" },
    { id: "FIL-4", project: "PRJ-123", type: "Certificate of Incorporation", submitted: "", status: "Not submitted", ref: "", updated: atOff(-1, 15), next: "File once client signs", nextDate: dISO(1), outcome: "" },
    { id: "FIL-5", project: "PRJ-110", type: "Certificate of Formation", submitted: dISO(-30), status: "Approved", ref: "TX-DEMO-8802", updated: atOff(-22), next: "", nextDate: "", outcome: "Approved" },
    { id: "FIL-6", project: "PRJ-108", type: "Articles of Organization", submitted: dISO(-45), status: "Approved", ref: "FL-DEMO-4410", updated: atOff(-38), next: "", nextDate: "", outcome: "Approved" },
  ];
}

function buildReminders(): Reminder[] {
  return [
    { id: 1, project: "PRJ-101", title: "Annual report reminder — Lee Botanicals LLC (Wyoming)", date: dISO(20), kind: "Annual report", illustrative: true },
    { id: 2, project: "PRJ-104", title: "Annual report reminder — Oyelaran Freight LLC (Delaware)", date: dISO(34), kind: "Annual report", illustrative: true },
    { id: 3, project: "PRJ-106", title: "Annual report reminder — Okafor Consulting LLC (New Mexico)", date: dISO(-3), kind: "Annual report", illustrative: true },
  ];
}

function buildServices(): Service[] {
  const svc = (id: string, name: string, category: string, desc: string, reqs: string[], stages: string[]): Service => ({
    id,
    name,
    category,
    desc,
    reqs,
    stages,
    turnaround: "",
    fee: "",
    active: true,
  });
  const services = [
    svc("llc", "LLC formation", "Formation", "Form a limited liability company in the client's chosen state.", ["Owner identity documents", "Proof of address", "Business name options", "Member and ownership details"], ["Client Onboarding", "Information Required", "Documents Pending", "Documents Under Review", "Ready for Filing", "State Filing in Progress", "State Approval Received", "Post-Formation Documents", "Completed"]),
    svc("corp", "Corporation formation", "Formation", "Incorporate a C or S corporation, including initial share structure.", ["Director and officer details", "Share structure worksheet", "Identity documents"], ["Client Onboarding", "Information Required", "Documents Under Review", "Ready for Filing", "State Filing in Progress", "State Approval Received", "Completed"]),
    svc("ra", "Registered agent service", "Compliance", "Provide a registered agent address and forward official notices.", ["Entity name and state", "Agent consent form"], ["Client Onboarding", "Documents Under Review", "Completed"]),
    svc("ein", "EIN assistance", "Tax", "Help the client prepare and submit an EIN application.", ["Responsible party details", "Formation documents"], ["Information Required", "Documents Under Review", "EIN Processing", "Completed"]),
    svc("oa", "Operating agreement preparation", "Documents", "Prepare a single- or multi-member operating agreement.", ["Member list and ownership percentages", "Management structure"], ["Information Required", "Documents Under Review", "Completed"]),
    svc("annual", "Annual report assistance", "Compliance", "Remind the client and help prepare state annual reports.", ["Current entity details", "State account access, if applicable"], ["Information Required", "Ready for Filing", "State Filing in Progress", "Completed"]),
    svc("deadlines", "Compliance deadline support", "Compliance", "Track compliance reminders the client has asked the team to watch.", ["Entity list", "Reminder preferences"], ["Client Onboarding", "Completed"]),
    svc("address", "Business address and mail handling", "Operations", "Business address and mail scanning, where offered.", ["Identity documents", "Proof of address", "Mail handling authorization"], ["Client Onboarding", "Documents Under Review", "Completed"]),
    svc("post", "Post-formation documentation", "Documents", "Prepare the post-formation package: resolutions, member certificates and records.", ["Approved formation documents"], ["Post-Formation Documents", "Completed"]),
    svc("amend", "Business amendments and updates", "Formation", "Amend entity details such as name, members or address with the state.", ["Change details", "Supporting documents"], ["Information Required", "Documents Under Review", "Ready for Filing", "State Filing in Progress", "Completed"]),
  ];
  const address = services.find((s) => s.id === "address");
  if (address) address.active = false;
  return services;
}

/** Fresh, fully seeded demo data. Dates are relative to today so deadlines stay meaningful. */
export function buildSeed(): DemoData {
  return {
    company: { name: "Innovexify", logo: "", casePrefix: "CASE" },
    users: buildUsers(),
    projects: buildProjects(),
    tasks: buildTasks(),
    docs: buildDocs(),
    msgs: buildMessages(),
    lastRead: {
      u1: { c42: 3, c47: 1 },
      u2: { c42: 3, c43: 1, c47: 2 },
      u3: { c42: 3, c47: 1 },
      u4: { c43: 0, c49: 0 },
      u5: { c42: 3, c47: 2 },
      c42: { c42: 2 },
      c43: { c43: 1 },
      c47: { c47: 2 },
      c49: { c49: 1 },
    },
    reports: buildReports(),
    anns: buildAnnouncements(),
    tickets: buildTickets(),
    notifs: {
      c42: [{ text: "Document requested: Proof of address (updated)", time: "15 October 2026", unread: true, link: "cdocs", at: atOff(-1) }],
      u3: [{ text: "New message from Alex Morgan", time: "15 October 2026", unread: false, link: "messages", at: atOff(-1) }],
      u5: [{ text: "CSR report RPT-201 from John Smith", time: "16 October 2026", unread: true, link: "reports", at: atOff(-1) }],
      u1: [
        { text: "TKT-1001 is marked High priority", time: fmtAt(atOff(-4, 10)), unread: true, link: "tickets", at: atOff(-4, 10) },
        { text: "Task overdue: Check Florida filing status", time: fmtAt(atOff(-1, 9)), unread: true, link: "tasks", at: atOff(-1, 9) },
        { text: "Ravi Patel's formation was completed", time: fmtAt(atOff(-12, 16)), unread: false, link: "cases", at: atOff(-12, 16) },
      ],
      u2: [{ text: "3 documents are waiting for review", time: fmtAt(atOff(0, 8)), unread: true, link: "documents", at: atOff(0, 8) }],
      u4: [{ text: "Follow-up overdue: Aisha Rahman", time: fmtAt(atOff(0, 8)), unread: true, link: "followups", at: atOff(0, 8) }],
      u6: [{ text: "Report RPT-199 needs a reply", time: fmtAt(atOff(-2, 12)), unread: true, link: "reports", at: atOff(-2, 12) }],
    },
    audit: [
      { time: "16 October 2026, 4:12 PM", at: atOff(-1, 10), actor: "u3", action: "Submitted report RPT-201", target: "CASE-2026-0042", ok: true },
      { time: "16 October 2026, 10:02 AM", at: atOff(-2, 10), actor: "u5", action: "Changed TKT-1002 to Waiting for Internal Team", target: "CASE-2026-0042", ok: true },
      { time: "15 October 2026, 3:10 PM", at: atOff(-3, 10), actor: "u2", action: "Resolved TKT-1003", target: "CASE-2026-0049", ok: true },
      { time: "15 October 2026, 9:00 AM", at: atOff(-4, 10), actor: "u5", action: "Requested document: Proof of address (updated)", target: "CASE-2026-0042", ok: true },
      { time: "14 October 2026, 11:20 AM", at: atOff(-5, 10), actor: "u2", action: "Invited client Tomás Rivera", target: "CASE-2026-0053", ok: true },
      { time: fmtAt(atOff(-12, 16)), at: atOff(-12, 16), actor: "u2", action: "Moved PRJ-110 to Completed", target: "CASE-2026-0040", ok: true },
      { time: fmtAt(atOff(-14, 9)), at: atOff(-14, 9), actor: "u3", role: "CSR", action: "Refused: Download Passport (Ravi Patel).pdf", target: "CASE-2026-0040", ok: false },
    ],
    triggers: buildTriggers(),
    followups: buildFollowups(),
    interactions: buildInteractions(),
    filings: buildFilings(),
    reminders: buildReminders(),
    services: buildServices(),
    counters: {
      nextCase: 54,
      nextUser: 10,
      nextId: 500,
      nextTicket: 1004,
      nextReport: 202,
      nextPrj: 127,
      nextFu: 20,
      nextInt: 20,
      nextFiling: 10,
    },
    sessionStartedAt: Date.now(),
  };
}
