import { describe, expect, it } from "vitest";

import { STAGES } from "@/constants/vocab";
import * as enums from "@/lib/mappers/enums";
import { toDay, toMs } from "@/lib/mappers/common";
import { mapClient, mapUser } from "@/lib/mappers/people";
import { mapMe, mapPrefs } from "@/lib/mappers/session";
import { mapAnalytics, hoursLabel, type ApiAnalytics } from "@/lib/mappers/analytics";
import { mapService, mapTrigger } from "@/lib/mappers/system";

const maps = Object.entries(enums).filter(([, v]) => typeof v === "object" && v !== null && "keys" in v && "labels" in v) as Array<[string, enums.EnumMap<string>]>;

describe("enum maps", () => {
  it("covers every enum the API uses", () => {
    expect(maps.length).toBeGreaterThanOrEqual(18);
  });

  it.each(maps)("%s: every key round-trips to its label and back", (_name, map) => {
    for (const key of map.keys) {
      const label = map.toLabel(key);
      expect(map.labels).toContain(label);
      expect(map.toKey(label)).toBe(key);
      expect(map.index(key)).toBe(map.keys.indexOf(key));
    }
  });

  it.each(maps)("%s: keys and labels line up and are unique", (_name, map) => {
    expect(map.keys).toHaveLength(map.labels.length);
    expect(new Set(map.keys).size).toBe(map.keys.length);
    expect(new Set(map.labels).size).toBe(map.labels.length);
  });

  it("falls back to readable text for a value the screens do not know, never throwing", () => {
    expect(enums.TICKET_STATUS.toLabel("WAITING_FOR_LEGAL")).toBe("Waiting for legal");
    expect(enums.CASE_STAGE.toLabel("SOMETHING_NEW")).toBe("Something new");
    expect(enums.PRIORITY.toLabel(null)).toBe("—");
    expect(enums.PRIORITY.toLabel(undefined)).toBe("—");
    expect(enums.CASE_STAGE.index("SOMETHING_NEW")).toBe(-1);
    expect(enums.CASE_STAGE.toKey("Not a stage")).toBe("Not a stage");
  });

  it("keeps the stage order the workflow depends on", () => {
    expect(enums.CASE_STAGE.labels).toEqual(STAGES);
    expect(enums.CASE_STAGE.index("DOCUMENTS_UNDER_REVIEW")).toBe(4);
    expect(enums.CASE_STAGE.toLabel("COMPLETED")).toBe("Completed");
  });

  it("maps documents to the lower-case statuses the screens use", () => {
    expect(enums.DOC_STATUS_MAP.toLabel("SUBMITTED")).toBe("submitted");
    expect(enums.DOC_STATUS_MAP.toKey("info")).toBe("INFO");
  });
});

describe("dates", () => {
  it("leaves a date-only value exactly as it is, whatever the timezone", () => {
    expect(toDay("2026-11-01")).toBe("2026-11-01");
    expect(toDay("2026-11-01T23:30:00.000Z")).toBe("2026-11-01");
    expect(toDay(null)).toBe("");
    expect(toDay(undefined)).toBe("");
  });

  it("turns timestamps into milliseconds and ignores nonsense", () => {
    expect(toMs("2026-10-22T21:26:34.323Z")).toBe(Date.UTC(2026, 9, 22, 21, 26, 34, 323));
    expect(toMs("not a date")).toBeUndefined();
    expect(toMs(null)).toBeUndefined();
  });
});

describe("people and session mappers", () => {
  it("maps the signed-in user", () => {
    expect(mapMe({ id: "c42", email: "a@b.co", name: "Alex", role: "CLIENT", status: "ACTIVE", clientProfile: { caseNumber: "CASE-2026-0042", csrId: "u3", businessName: "Northfield", formationState: "Wyoming" } })).toEqual({
      id: "c42",
      name: "Alex",
      email: "a@b.co",
      role: "CLIENT",
      status: "Active",
      caseId: "CASE-2026-0042",
      csr: "u3",
      biz: "Northfield",
      state: "Wyoming",
    });
    expect(mapMe({ id: "u1", email: "s@b.co", name: "Sarah", role: "ADMIN", status: "ACTIVE", clientProfile: null })).not.toHaveProperty("caseId");
  });

  it("maps a staff row with its workload and a client row with its case", () => {
    const staff = mapUser({
      id: "u3",
      email: "j@b.co",
      name: "John",
      role: "CSR",
      status: "SUSPENDED",
      invitedById: "u2",
      invitedByName: "Daniel",
      lastLoginAt: null,
      lastActivityAt: "2026-05-01T10:00:00.000Z",
      workload: { clients: 2, cases: 1, openTasks: 2, overdueTasks: 1, openFollowUps: 1, openTickets: 1, reviewsLast30Days: 0 },
      caseNumber: null,
    });
    expect(staff).toMatchObject({ status: "Suspended", invitedBy: "u2", invitedByName: "Daniel", lastActivityAt: Date.UTC(2026, 4, 1, 10), workload: { openTasks: 2 } });

    const client = mapClient({
      id: "c42",
      email: "a@b.co",
      name: "Alex",
      status: "INVITED",
      caseNumber: "CASE-2026-0042",
      businessName: "",
      formationState: "",
      phone: "",
      contactPreference: "PHONE",
      csr: null,
      joinedAt: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      case: { id: "k1", number: 118, displayNumber: "PRJ-118", serviceId: "llc", stage: "DOCUMENTS_PENDING", status: "AWAITING_CLIENT", priority: "HIGH", deadline: "2026-11-01", lastActivityAt: null },
      nextFollowUp: { id: "f1", due: "2026-10-30", type: "PORTAL_MESSAGE" },
      onboarding: { done: 3, total: 5 },
    });
    expect(client).toMatchObject({
      status: "Invited",
      csr: null,
      contactPref: "Phone",
      currentCase: { id: "k1", display: "PRJ-118", stage: "Documents Pending", stageIdx: 3, status: "Awaiting Client", priority: "High", deadline: "2026-11-01" },
      nextFollowUp: { due: "2026-10-30", type: "Portal message" },
      onboarding: { done: 3, total: 5 },
    });
  });

  it("fills notification preferences, with every category on unless the server says otherwise", () => {
    const prefs = mapPrefs([{ category: "TICKETS", email: false, inApp: true }]);
    expect(prefs.tickets).toEqual({ email: false, app: true });
    expect(prefs.msg).toEqual({ email: true, app: true });
    expect(Object.keys(prefs).sort()).toEqual(["anns", "docs", "msg", "stage", "tickets"]);
  });
});

describe("settings and analytics mappers", () => {
  it("maps services and triggers", () => {
    expect(mapService({ id: "llc", name: "LLC formation", category: "Formation", description: "d", requirements: ["ID"], stages: ["CLIENT_ONBOARDING", "COMPLETED"], turnaround: "", fee: "", active: true, activeCases: 3 })).toMatchObject({
      desc: "d",
      reqs: ["ID"],
      stages: ["Client Onboarding", "Completed"],
      activeCases: 3,
    });
    expect(mapTrigger({ key: "sec", name: "Security event", enabled: true, template: "Security alert", templateOptions: ["Security alert"], security: true })).toEqual({
      k: "sec",
      name: "Security event",
      on: true,
      tpl: "Security alert",
      opts: ["Security alert"],
      security: true,
    });
  });

  const base: ApiAnalytics = {
    range: { from: "2026-05-01", to: "2026-07-31" },
    cases: { byStage: [{ key: "COMPLETED", count: 2 }], byStatus: [{ key: "COMPLETED", count: 2 }], completed: 2, averageDaysToComplete: 15.25, completedByMonth: [{ month: "2026-05", count: 1 }] },
    documentReviews: { reviewed: 3, averageHoursToReview: 12, sentBack: 2, sentBackRate: 0.667 },
    tickets: { resolved: 2, averageHoursToResolve: 60, open: 2, reopened: 1 },
    tasks: { done: 2, open: 2, overdue: 1 },
    csrs: [],
    compliance: [],
    onboarding: { clients: 4, steps: [{ key: "caseOpened", count: 3, percent: 75 }] },
  };

  it("words averages, and shows a dash rather than 0 when nothing is behind them", () => {
    expect(hoursLabel(12)).toBe("12 h");
    expect(hoursLabel(60)).toBe("2.5 days");
    expect(hoursLabel(null)).toBe("—");
    const a = mapAnalytics(base);
    expect(a).toMatchObject({ avgDuration: "15 days", revAvg: "12 h", tkAvg: "2.5 days", monthly: [{ label: "May", n: 1 }], stage: [{ label: "Completed", n: 2 }] });
    const empty = mapAnalytics({ ...base, cases: { ...base.cases, averageDaysToComplete: null }, documentReviews: { reviewed: 0, averageHoursToReview: null, sentBack: 0, sentBackRate: null }, onboarding: { clients: 0, steps: [{ key: "caseOpened", count: 0, percent: null }] } });
    expect(empty.avgDuration).toBe("—");
    expect(empty.revAvg).toBe("—");
    expect(empty.onboard).toEqual([{ label: "Case opened", n: 0, pct: 0 }]);
  });
});
