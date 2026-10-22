import type { TicketStatus } from "@prisma/client";

import { ACTIVE_STATUSES, isActive, isStatusChange, NEXT_STATUS, STAFF_ONLY_STATUSES, TICKET_LABEL, whyNot, withinReopenWindow } from "./ticket-rules";

const ALL = Object.keys(TICKET_LABEL) as TicketStatus[];

describe("ticket status machine", () => {
  it("lets the four active statuses move among themselves, and on to Resolved or Closed", () => {
    for (const from of ACTIVE_STATUSES) {
      for (const to of ALL) {
        const expected = from !== to;
        expect(NEXT_STATUS[from].includes(to)).toBe(expected);
      }
    }
  });

  it("lets a Resolved ticket only be reopened or closed", () => {
    expect([...NEXT_STATUS.RESOLVED].sort()).toEqual(["CLOSED", "OPEN"]);
    for (const to of ["IN_PROGRESS", "WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL_TEAM", "RESOLVED"] as const) expect(NEXT_STATUS.RESOLVED).not.toContain(to);
  });

  it("makes Closed final", () => {
    expect(NEXT_STATUS.CLOSED).toEqual([]);
  });

  it("covers every status exactly once, with a label", () => {
    expect(Object.keys(NEXT_STATUS).sort()).toEqual([...ALL].sort());
    expect(TICKET_LABEL).toEqual({
      OPEN: "Open",
      IN_PROGRESS: "In Progress",
      WAITING_FOR_CLIENT: "Waiting for Client",
      WAITING_FOR_INTERNAL_TEAM: "Waiting for Internal Team",
      RESOLVED: "Resolved",
      CLOSED: "Closed",
    });
  });

  it("knows which statuses are active and which only staff may set", () => {
    expect(ALL.filter(isActive)).toEqual(["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL_TEAM"]);
    expect([...STAFF_ONLY_STATUSES].sort()).toEqual(["IN_PROGRESS", "WAITING_FOR_CLIENT", "WAITING_FOR_INTERNAL_TEAM"]);
  });

  it("explains a refused move in words", () => {
    expect(whyNot("OPEN", "OPEN")).toBe("It is already in that status.");
    expect(whyNot("CLOSED", "OPEN")).toContain("closed ticket is final");
    expect(whyNot("RESOLVED", "IN_PROGRESS")).toContain("can only be reopened");
  });

  it("treats an event whose status didn't change as internal", () => {
    expect(isStatusChange({ fromStatus: "OPEN", toStatus: "OPEN" })).toBe(false);
    expect(isStatusChange({ fromStatus: null, toStatus: "OPEN" })).toBe(true);
    expect(isStatusChange({ fromStatus: "OPEN", toStatus: "RESOLVED" })).toBe(true);
  });
});

describe("reopen window", () => {
  const now = new Date("2026-10-22T12:00:00.000Z");
  const daysAgo = (n: number, extraMs = 0): Date => new Date(now.getTime() - n * 86_400_000 - extraMs);

  it("allows a reopen up to and including the last moment of the window", () => {
    expect(withinReopenWindow(daysAgo(0), now, 7)).toBe(true);
    expect(withinReopenWindow(daysAgo(6), now, 7)).toBe(true);
    expect(withinReopenWindow(daysAgo(7), now, 7)).toBe(true);
  });
  it("refuses one a moment after it", () => {
    expect(withinReopenWindow(daysAgo(7, 1), now, 7)).toBe(false);
    expect(withinReopenWindow(daysAgo(30), now, 7)).toBe(false);
  });
  it("is configurable, and 0 means never", () => {
    expect(withinReopenWindow(daysAgo(10), now, 14)).toBe(true);
    expect(withinReopenWindow(daysAgo(0), now, 0)).toBe(false);
  });
  it("treats a ticket with no recorded resolution time as inside the window", () => {
    expect(withinReopenWindow(null, now, 7)).toBe(true);
  });
});
