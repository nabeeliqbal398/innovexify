export type GuideKey = "start" | "roles" | "docs" | "tickets";

export const GUIDES: Record<GuideKey, { title: string; items: ReadonlyArray<readonly [string, string]> }> = {
  start: {
    title: "Getting started",
    items: [
      ["Find your work", "The sidebar groups pages by purpose. Counts show items that need you, such as unread messages or overdue tasks."],
      ["Search", "Use the search box in the top bar to jump to clients, cases, tickets and messages you are allowed to see."],
      ["Notifications", "The bell lists in-app notifications. Open one to go straight to the related page."],
      ["Is anything simulated?", "No. Everything you see is saved by the server. Emails are sent through the mail service your administrator connects; until one is connected, invitation links are only in the server log."],
    ],
  },
  roles: {
    title: "Role guides",
    items: [
      ["Admin", "Owns company settings, branding, user removal and the audit log. Can do everything a Manager can."],
      ["Manager", "Runs operations: cases, tasks, team workload, reassignments, document review and notification rules. Cannot remove users, change branding, invite Managers or edit Admin and other Manager emails."],
      ["CSR", "Owns client relationships: invitations, follow-ups, messages and reports to Compliance. Sees document status only, never file contents."],
      ["Compliance", "Reviews documents, requests information, tracks filings and the compliance calendar, and answers CSR reports."],
    ],
  },
  docs: {
    title: "Document process",
    items: [
      ["Request", "Compliance or a Manager requests a named document. The client sees it under Documents and on Home."],
      ["Upload", "The client uploads PDF, PNG, JPG or DOCX up to 25 MB. The file is checked, scanned if scanning is switched on, and stored by the server."],
      ["Review", "Reviewers approve, reject or ask for more information. A reason is required for anything other than approval and is shown to the client."],
      ["Privacy", "CSRs see the status of each document but can never open, preview or download it, by any route."],
    ],
  },
  tickets: {
    title: "Ticket handling",
    items: [
      ["Statuses", "Open, In Progress, Waiting for Client, Waiting for Internal Team, Resolved and Closed."],
      ["Resolving", "Resolution notes are required. The resolution records who resolved it, their role and when."],
      ["Internal notes", "Tick “Internal note” to keep a reply hidden from the client."],
      ["Reopening", "Clients can request reopening. The earlier resolution stays in the history."],
    ],
  },
};

export const FAQ: ReadonlyArray<readonly [string, string]> = [
  ["Why can't I see a client?", "CSRs see clients assigned to them and new clients who still need a CSR. Ask a Manager to reassign a client."],
  ["Can I attach files to client messages?", "Admin, Manager and Compliance can. CSRs can't, so client files never reach a CSR through messaging."],
  ["Are fees in the service catalog real prices?", "No. Fees and turnaround times are editable internal fields and are not shown to clients as promises."],
  ["Are calendar dates legal deadlines?", "No. Annual report reminders are illustrative until confirmed against the state's own records."],
  ["Is the audit log permanent?", "Yes. The server records every allowed and refused action and the portal has no way to change or delete an entry. Only Admin can read it."],
];
