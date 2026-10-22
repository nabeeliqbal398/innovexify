import { ROLE_LABEL } from "@/constants/vocab";
import { NAV } from "@/constants/nav";
import { DEFAULT_VIEW } from "@/constants/vocab";
import { stamp } from "@/lib/dates";
import { REASON, type Permission } from "@/lib/permissions";
import type { AppThunk } from "@/store";
import { fail, flash, guard, notify, OK, showDenied, type ActionResult } from "@/store/actions/core";
import { projectOfClient, selectMe, staffIds, teamFor, userById } from "@/store/selectors";
import { workspaceActions } from "@/store/workspaceSlice";
import type {
  Announcement,
  AnnouncementPriority,
  ClientDoc,
  DemoData,
  DocStatus,
  Priority,
  Report,
  ReportStatus,
  Ticket,
  TicketStatus,
} from "@/types/domain";

/* ------------------------------ files ------------------------------ */

export const ACCEPTED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "docx"] as const;
const MAX_FILE_BYTES = 25 * 1_048_576;

/** Returns an error message, or an empty string when the file is acceptable. */
export function validateFile(file: { name: string; size: number } | null | undefined): string {
  if (!file) return "Choose a file.";
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return "That file type isn't accepted. Use PDF, PNG, JPG or DOCX.";
  }
  if (file.size > MAX_FILE_BYTES) return "That file is larger than 25 MB. Compress it or split it into parts.";
  if (file.size === 0) return "That file is empty.";
  return "";
}

/* ---------------------------- documents ---------------------------- */

export interface DocumentRequestInput {
  client: string;
  name: string;
  type: string;
  note: string;
}

export function requestDocument(input: DocumentRequestInput): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const client = userById(data, input.client);
    const name = input.name.trim();
    if (!client) return fail("Choose a client.");
    if (!name) return fail("Enter a document name.");
    if (!dispatch(guard("docsManage", undefined, `Requested document: ${name}`, client.caseId ?? ""))) return fail("Not allowed.");
    const note = input.note.trim();
    const now = Date.now();
    const doc: ClientDoc = {
      id: data.counters.nextId,
      client: client.id,
      name,
      file: "",
      status: "requested",
      reason: "",
      requestedBy: me.id,
      type: input.type || "Other",
      note,
      requestedAt: now,
      history: [{ status: "requested", by: me.id, at: now, note }],
    };
    dispatch(workspaceActions.added({ key: "docs", item: doc }));
    dispatch(workspaceActions.counterBumped("nextId"));
    dispatch(notify([client.id], `Document requested: ${name}`, "cdocs"));
    flash(`Requested “${name}” from ${client.name}`);
    return OK;
  };
}

export function shareDocument(input: { client: string; name: string; fileName: string }): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const client = userById(data, input.client);
    if (!client) return fail("Choose a client first");
    const name = input.name.trim() || input.fileName;
    if (!dispatch(guard("docsManage", undefined, `Shared document ${input.fileName}`, client.caseId ?? ""))) return fail("Not allowed.");
    dispatch(
      workspaceActions.added({
        key: "docs",
        item: {
          id: data.counters.nextId,
          client: client.id,
          name,
          file: input.fileName,
          status: "shared",
          reason: "",
          type: "Other",
          requestedAt: Date.now(),
          history: [{ status: "shared", by: me.id, at: Date.now(), note: "" }],
        },
      }),
    );
    dispatch(workspaceActions.counterBumped("nextId"));
    dispatch(notify([client.id], `New document shared with you: ${name}`));
    flash(`Shared with ${client.name} (demo state, not uploaded)`);
    return OK;
  };
}

export function reviewDocument(docId: number, decision: Extract<DocStatus, "approved" | "rejected" | "info">, reason: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const doc = data.docs.find((d) => d.id === docId);
    if (!doc) return fail("That document no longer exists.");
    const client = userById(data, doc.client);
    const why = reason.trim();
    if (decision !== "approved" && !why) return fail("Add a reason the client will see");
    const verb = decision === "approved" ? "Approved " : decision === "rejected" ? "Rejected " : "Requested more information on ";
    if (!dispatch(guard("docsReview", undefined, `${verb}${doc.name}`, client?.caseId ?? "", { cat: "docs" }))) return fail("Not allowed.");
    const now = Date.now();
    dispatch(
      workspaceActions.patched({
        key: "docs",
        id: docId,
        patch: {
          status: decision,
          reason: decision === "approved" ? "" : why,
          reviewedBy: me.id,
          reviewedAt: now,
          history: [...doc.history, { status: decision, by: me.id, at: now, note: decision === "approved" ? "" : why }],
        },
      }),
    );
    const message =
      decision === "approved"
        ? "was approved"
        : decision === "rejected"
          ? `needs a correction: ${why}`
          : `needs more information: ${why}`;
    dispatch(notify([doc.client], `“${doc.name}” ${message}`, "cdocs"));
    flash(
      decision === "approved"
        ? "Approved · client notified"
        : decision === "rejected"
          ? "Rejected with your reason · client notified"
          : "More information requested · client notified",
    );
    return OK;
  };
}

/** Preview or download. Opening a file is simulated; the permission check is the real part. */
export function openFile(docId: number, how: "Preview" | "Download"): AppThunk<boolean> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const doc = data.docs.find((d) => d.id === docId);
    if (!doc) return false;
    const client = userById(data, doc.client);
    const ok = dispatch(guard("docsAccess", doc, `${how} ${doc.file || doc.name}`, client?.caseId ?? "", { cat: "docs" }));
    if (ok && how === "Download") flash("Download simulated. Production serves files through short-lived, permission-checked links.");
    return ok;
  };
}

export function clientUpload(docId: number, fileName: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const doc = data.docs.find((d) => d.id === docId);
    if (!doc) return fail("That request no longer exists.");
    if (!dispatch(guard("docsAccess", doc, `Uploaded ${fileName}`, me.caseId ?? ""))) return fail("Not allowed.");
    const now = Date.now();
    dispatch(
      workspaceActions.patched({
        key: "docs",
        id: docId,
        patch: {
          status: "submitted",
          file: fileName,
          reason: "",
          submittedAt: now,
          history: [...doc.history, { status: "submitted", by: me.id, at: now, note: fileName }],
        },
      }),
    );
    dispatch(notify(staffIds(data, ["ADMIN", "MANAGER", "COMPLIANCE"]), `${me.name} submitted “${doc.name}” for review`, "documents"));
    flash("Submitted for review (demo state, nothing uploaded)");
    return OK;
  };
}

/* ----------------------------- messages ---------------------------- */

export function sendMessage(clientId: string, text: string, attach: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const body = text.trim();
    if (!body) return fail("Write a message first.");
    const target = me.role === "CLIENT" ? me.id : clientId;
    const client = userById(data, target);
    if (!client) return fail("Select a conversation first.");
    if (!dispatch(guard("conversation", client, "Sent message", client.caseId ?? ""))) return fail("Not allowed.");
    if (attach && me.role !== "CLIENT" && !dispatch(guard("attachStaff", client, `Attached ${attach}`, client.caseId ?? ""))) {
      return fail("Not allowed.");
    }
    dispatch(
      workspaceActions.messageAdded({
        clientId: target,
        readerId: me.id,
        message: { from: me.id, text: body, time: stamp(), at: Date.now(), attach: attach || undefined },
      }),
    );
    if (me.role === "CLIENT") {
      dispatch(notify(teamFor(data, me.id), `New message from ${me.name}`, "messages"));
      flash("Sent to your team");
    } else {
      dispatch(notify([target], `New message from ${me.name} (${ROLE_LABEL[me.role]})`, "cmsgs"));
      flash(`Sent to ${client.name} · in-app notification created`);
    }
    return OK;
  };
}

/** Opens a staff conversation after the scope check, and marks it read. */
export function openConversation(clientId: string): AppThunk<boolean> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const client = userById(data, clientId);
    if (!dispatch(guard("conversation", client, "Opened conversation", client?.caseId ?? "", { silent: true }))) {
      dispatch(showDenied("Not available", REASON.conversation));
      return false;
    }
    dispatch(workspaceActions.conversationRead({ readerId: me.id, clientId }));
    return true;
  };
}

/* ------------------------------ reports ---------------------------- */

export interface ReportInput {
  client: string;
  title: string;
  body: string;
  category: string;
  priority: Priority;
  action: string;
}

export function submitReport(input: ReportInput): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const client = userById(data, input.client);
    if (!client) return fail("Select one of your clients.");
    if (!dispatch(guard("reportSend", client, `Submitted report “${input.title.trim()}”`, client.caseId ?? ""))) return fail("Not allowed.");
    const id = `RPT-${data.counters.nextReport}`;
    const project = projectOfClient(data, client.id);
    const now = Date.now();
    const report: Report = {
      id,
      client: client.id,
      csr: me.id,
      project: project?.id ?? "",
      title: input.title.trim(),
      body: input.body.trim(),
      category: input.category || "Other",
      priority: input.priority,
      action: input.action.trim(),
      status: "Submitted",
      created: stamp(),
      createdAt: now,
      thread: [],
      notes: [],
      history: [{ status: "Submitted", by: me.id, at: now }],
    };
    dispatch(workspaceActions.added({ key: "reports", item: report, prepend: true }));
    dispatch(workspaceActions.counterBumped("nextReport"));
    dispatch(notify(staffIds(data, ["COMPLIANCE"]), `New CSR report ${id} from ${me.name}`, "reports"));
    flash(`${id} sent to Compliance`);
    return { ok: true, id };
  };
}

export function replyReport(reportId: string, text: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const report = data.reports.find((r) => r.id === reportId);
    if (!report) return fail("That report no longer exists.");
    if (!text.trim()) return fail("Write a reply first.");
    if (!dispatch(guard("reportView", report, `Replied on ${report.id}`, userById(data, report.client)?.caseId ?? ""))) return fail("Not allowed.");
    dispatch(
      workspaceActions.patched({
        key: "reports",
        id: reportId,
        patch: {
          thread: [...report.thread, { from: me.id, text: text.trim(), time: stamp() }],
          status: me.role === "CSR" && report.status === "Clarification requested" ? "Submitted" : report.status,
        },
      }),
    );
    dispatch(notify(me.role === "CSR" ? staffIds(data, ["COMPLIANCE"]) : [report.csr], `Reply on ${report.id} from ${me.name}`, "reports"));
    return OK;
  };
}

export function setReportStatus(reportId: string, status: ReportStatus): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const report = data.reports.find((r) => r.id === reportId);
    if (!report) return fail("That report no longer exists.");
    if (!dispatch(guard("reportReview", undefined, `Marked ${report.id} ${status}`, userById(data, report.client)?.caseId ?? ""))) {
      return fail("Not allowed.");
    }
    dispatch(
      workspaceActions.patched({
        key: "reports",
        id: reportId,
        patch: { status, history: [...report.history, { status, by: me.id, at: Date.now() }] },
      }),
    );
    dispatch(notify([report.csr], `${report.id}: ${status === "Reviewed" ? "Resolved" : status}`, "reports"));
    flash(`${report.id} marked ${status === "Reviewed" ? "resolved" : status.toLowerCase()}`);
    return OK;
  };
}

export function acknowledgeReport(reportId: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const report = data.reports.find((r) => r.id === reportId);
    if (!report) return fail("That report no longer exists.");
    if (!dispatch(guard("reportAck", undefined, `Acknowledged ${report.id}`, userById(data, report.client)?.caseId ?? ""))) {
      return fail("Not allowed.");
    }
    dispatch(
      workspaceActions.patched({
        key: "reports",
        id: reportId,
        patch: { status: "Acknowledged", history: [...report.history, { status: "Acknowledged", by: me.id, at: Date.now() }] },
      }),
    );
    dispatch(notify([report.csr], `${report.id} was acknowledged by ${me.name}`, "reports"));
    flash(`${report.id} acknowledged`);
    return OK;
  };
}

export function addReportNote(reportId: string, text: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const me = selectMe(getState());
    const report = getState().workspace.data.reports.find((r) => r.id === reportId);
    if (!report) return fail("That report no longer exists.");
    if (!text.trim()) return fail("Write a note first.");
    if (!dispatch(guard("reportReview", undefined, `Added compliance note on ${report.id}`, ""))) return fail("Not allowed.");
    dispatch(
      workspaceActions.patched({
        key: "reports",
        id: reportId,
        patch: { notes: [...report.notes, { from: me.id, text: text.trim(), time: stamp() }] },
      }),
    );
    return OK;
  };
}

/* --------------------------- announcements ------------------------- */

export interface AnnouncementInput {
  title: string;
  msg: string;
  aud: string;
  prio: AnnouncementPriority;
  exp: string;
  ack: boolean;
}

function announcementAudience(aud: string, data: DemoData): string[] {
  return aud === "all"
    ? data.users.filter((u) => u.role === "CLIENT" && u.status === "Active").map((u) => u.id)
    : [aud];
}

export function saveAnnouncement(input: AnnouncementInput, publish: boolean): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    if (!input.title.trim() || !input.msg.trim()) return fail("Add a title and a message.");
    const target = input.aud === "all" ? "All clients" : (userById(data, input.aud)?.caseId ?? "");
    if (!dispatch(guard("announce", undefined, `${publish ? "Published" : "Drafted"} announcement “${input.title.trim()}”`, target))) {
      return fail("Not allowed.");
    }
    const announcement: Announcement = {
      id: data.counters.nextId,
      title: input.title.trim(),
      msg: input.msg.trim(),
      aud: input.aud,
      prio: input.prio,
      status: publish ? "Published" : "Draft",
      by: me.id,
      ack: input.ack,
      acks: {},
      date: publish ? stamp() : "",
      exp: input.exp,
    };
    dispatch(workspaceActions.added({ key: "anns", item: announcement, prepend: true }));
    dispatch(workspaceActions.counterBumped("nextId"));
    if (publish) dispatch(notify(announcementAudience(input.aud, data), `Announcement: ${announcement.title}`));
    flash(publish ? "Published · in-app notifications created" : "Draft saved");
    return OK;
  };
}

export function setAnnouncementStatus(id: number, status: "Published" | "Archived"): AppThunk {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const announcement = data.anns.find((a) => a.id === id);
    if (!announcement) return;
    const verb = status === "Published" ? "Published" : "Archived";
    if (!dispatch(guard("announce", undefined, `${verb} announcement “${announcement.title}”`, ""))) return;
    dispatch(
      workspaceActions.patched({
        key: "anns",
        id,
        patch: { status, date: status === "Published" ? stamp() : announcement.date },
      }),
    );
    if (status === "Published") dispatch(notify(announcementAudience(announcement.aud, data), `Announcement: ${announcement.title}`));
  };
}

export function acknowledgeAnnouncement(id: number): AppThunk {
  return (dispatch, getState) => {
    dispatch(workspaceActions.announcementAcked({ id, userId: selectMe(getState()).id }));
  };
}

/* ------------------------------ tickets ---------------------------- */

function ticketResource(data: DemoData, t: Ticket) {
  return { client: t.client, csrOf: userById(data, t.client)?.csr };
}

export function ticketReply(ticketId: string, text: string, internal: boolean): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const ticket = data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return fail("That ticket no longer exists.");
    if (!text.trim()) return fail("Write a reply first.");
    const label = `${internal ? "Internal note on " : "Replied on "}${ticket.id}`;
    if (!dispatch(guard("ticketsStaff", ticketResource(data, ticket), label, userById(data, ticket.client)?.caseId ?? ""))) {
      return fail("Not allowed.");
    }
    const time = stamp();
    dispatch(
      workspaceActions.patched({
        key: "tickets",
        id: ticketId,
        patch: { thread: [...ticket.thread, { from: me.id, text: text.trim(), time, internal }], updated: time },
      }),
    );
    if (!internal) dispatch(notify([ticket.client], `Reply on ${ticket.id} from ${me.name}`));
    return OK;
  };
}

export function ticketUpdate(ticketId: string, to: TicketStatus, note: string): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const ticket = data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return fail("That ticket no longer exists.");
    const label = `${to === "Resolved" ? "Resolved " : "Changed status of "}${ticket.id}${to === "Resolved" ? "" : ` to ${to}`}`;
    if (!dispatch(guard("ticketsStaff", ticketResource(data, ticket), label, userById(data, ticket.client)?.caseId ?? ""))) {
      return fail("Not allowed.");
    }
    const time = stamp();
    dispatch(
      workspaceActions.patched({
        key: "tickets",
        id: ticketId,
        patch: {
          status: to,
          updated: time,
          events: [...ticket.events, { from: ticket.status, to, by: me.id, time, note: note.trim() }],
          handler: ticket.handler || me.id,
          resolution: to === "Resolved" ? { by: me.id, time, at: Date.now(), note: note.trim() } : ticket.resolution,
        },
      }),
    );
    dispatch(notify([ticket.client], `${ticket.id} is now ${to}`, "home"));
    if (ticket.handler && ticket.handler !== me.id) dispatch(notify([ticket.handler], `${ticket.id} is now ${to}`, "tickets"));
    flash(`${ticket.id} → ${to} · recorded as ${me.name} (${ROLE_LABEL[me.role]})`);
    return OK;
  };
}

export function ticketAssignMe(ticketId: string): AppThunk {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const ticket = data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    if (!dispatch(guard("ticketsStaff", ticketResource(data, ticket), `Took over ${ticket.id}`, ""))) return;
    dispatch(workspaceActions.patched({ key: "tickets", id: ticketId, patch: { handler: me.id } }));
  };
}

export function ticketEscalate(ticketId: string): AppThunk {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const ticket = data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    const label = `${ticket.escalated ? "Removed escalation on " : "Escalated "}${ticket.id}`;
    if (!dispatch(guard("ticketsStaff", ticketResource(data, ticket), label, userById(data, ticket.client)?.caseId ?? ""))) return;
    const time = stamp();
    dispatch(
      workspaceActions.patched({
        key: "tickets",
        id: ticketId,
        patch: {
          escalated: !ticket.escalated,
          updated: time,
          events: [
            ...ticket.events,
            { from: ticket.status, to: ticket.status, by: me.id, time, note: ticket.escalated ? "Escalation removed" : "Escalated to Admin and Manager" },
          ],
        },
      }),
    );
    if (!ticket.escalated) {
      dispatch(notify(staffIds(data, ["ADMIN", "MANAGER"]).filter((id) => id !== me.id), `${ticket.id} was escalated by ${me.name}`, "tickets"));
    }
    flash(ticket.escalated ? "Escalation removed" : `${ticket.id} escalated · Admin and Manager notified`);
  };
}

export interface NewTicketInput {
  title: string;
  category: string;
  priority: string;
  desc: string;
  related: "case" | "none";
}

export function createTicket(input: NewTicketInput): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    if (!dispatch(guard("ticketOwn", { client: me.id }, `Created ticket “${input.title.trim()}”`, me.caseId ?? ""))) return fail("Not allowed.");
    const id = `TKT-${data.counters.nextTicket}`;
    const time = stamp();
    const project = projectOfClient(data, me.id);
    dispatch(
      workspaceActions.added({
        key: "tickets",
        prepend: true,
        item: {
          id,
          client: me.id,
          title: input.title.trim(),
          category: input.category,
          priority: input.priority,
          status: "Open",
          handler: "",
          created: time,
          createdAt: Date.now(),
          updated: time,
          desc: input.desc.trim(),
          resolution: null,
          escalated: false,
          project: input.related === "none" ? "" : (project?.id ?? ""),
          thread: [],
          events: [{ from: "", to: "Open", by: me.id, time, note: "Ticket created" }],
        },
      }),
    );
    dispatch(workspaceActions.counterBumped("nextTicket"));
    dispatch(notify(teamFor(data, me.id), `New ticket ${id} from ${me.name}`, "tickets"));
    return { ok: true, id };
  };
}

export function clientTicketAction(ticketId: string, kind: "reply" | "reopen" | "confirm", text = ""): AppThunk<ActionResult> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const ticket = data.tickets.find((t) => t.id === ticketId);
    if (!ticket) return fail("That ticket no longer exists.");
    const verb = kind === "reply" ? "Replied on " : kind === "reopen" ? "Requested reopening of " : "Confirmed resolution of ";
    if (!dispatch(guard("ticketOwn", ticket, `${verb}${ticket.id}`, me.caseId ?? ""))) return fail("Not allowed.");
    const time = stamp();
    if (kind === "reply") {
      if (!text.trim()) return fail("Write a reply first.");
      dispatch(
        workspaceActions.patched({
          key: "tickets",
          id: ticketId,
          patch: { thread: [...ticket.thread, { from: me.id, text: text.trim(), time, internal: false }], updated: time },
        }),
      );
    } else {
      const to: TicketStatus = kind === "reopen" ? "Open" : "Closed";
      dispatch(
        workspaceActions.patched({
          key: "tickets",
          id: ticketId,
          patch: {
            status: to,
            updated: time,
            events: [
              ...ticket.events,
              { from: ticket.status, to, by: me.id, time, note: kind === "reopen" ? "Client requested reopening" : "Client confirmed the issue is resolved" },
            ],
          },
        }),
      );
      flash(kind === "reopen" ? "Reopening requested. The previous resolution stays in the history." : "Thanks for confirming. Ticket closed.");
    }
    dispatch(notify(teamFor(data, me.id), `${me.name} updated ${ticket.id}`, "tickets"));
    return OK;
  };
}

/* --------------------------- notifications ------------------------- */

/** Mark a notification read and, when asked, return the view it points at (only if the role may open it). */
export function readNotification(index: number, open: boolean): AppThunk<string | null> {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const notification = data.notifs[me.id]?.[index];
    if (!notification) return null;
    dispatch(workspaceActions.notificationRead({ userId: me.id, index }));
    if (!open || !notification.link) return null;
    const allowed = NAV[me.role].some((v) => v.view === notification.link);
    return allowed ? notification.link : DEFAULT_VIEW[me.role];
  };
}

/* ------------------------- direct-request probes ------------------- */

export type ProbeKind =
  | "remove"
  | "doc"
  | "reassign"
  | "brand"
  | "other"
  | "settings"
  | "caseEdit"
  | "audit"
  | "fee"
  | "filing";

export const PROBES: ReadonlyArray<{ kind: ProbeKind; label: string }> = [
  { kind: "remove", label: "Remove Ayesha Khan from the portal" },
  { kind: "doc", label: "Download Registered agent consent.pdf (Alex Morgan)" },
  { kind: "reassign", label: "Reassign Alex Morgan to another CSR" },
  { kind: "brand", label: "Change the company name" },
  { kind: "other", label: "Read Sarah Johnson's case record" },
  { kind: "settings", label: "Open company-wide settings" },
  { kind: "caseEdit", label: "Edit case PRJ-118 details" },
  { kind: "audit", label: "Open the Audit & Security log" },
  { kind: "fee", label: "Change a service fee" },
  { kind: "filing", label: "Edit the state filing tracker" },
];

/** Ask the permission check directly, like a crafted URL or API call. Nothing changes. */
export function runProbe(kind: ProbeKind): AppThunk {
  return (dispatch, getState) => {
    const { data } = getState().workspace;
    const me = selectMe(getState());
    const table: Record<ProbeKind, [Permission, Parameters<typeof guard>[1]]> = {
      remove: ["removeUser", userById(data, "u4")],
      doc: ["docsAccess", data.docs.find((d) => d.id === 14)],
      reassign: ["reassignClient", userById(data, "c42")],
      brand: ["branding", undefined],
      other: ["viewClient", userById(data, "c43")],
      settings: ["companySettings", undefined],
      caseEdit: ["editCase", undefined],
      audit: ["auditLog", undefined],
      fee: ["manageServices", undefined],
      filing: ["filingTracker", undefined],
    };
    const label = PROBES.find((p) => p.kind === kind)?.label ?? kind;
    const [perm, res] = table[kind];
    const ok = dispatch(guard(perm, res, `Direct request: ${label}`, "simulated", { silent: true }));
    dispatch(workspaceActions.probeLogged({ role: ROLE_LABEL[me.role], label, ok }));
  };
}

export function resetDemo(): AppThunk {
  return (dispatch) => {
    dispatch(workspaceActions.resetData());
    flash("Demo data reset to the starting state");
  };
}

