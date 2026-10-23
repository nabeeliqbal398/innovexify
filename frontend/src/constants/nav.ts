import type { Permission } from "@/lib/permissions";
import type { Role } from "@/types/domain";

export type IconName =
  | "grid"
  | "users"
  | "userPlus"
  | "folder"
  | "tasks"
  | "file"
  | "filePlus"
  | "msg"
  | "clipboard"
  | "megaphone"
  | "ticket"
  | "zap"
  | "settings"
  | "home"
  | "briefcase"
  | "layers"
  | "chart"
  | "phone"
  | "help"
  | "calendar"
  | "flag"
  | "shield";

export interface NavItem {
  view: string;
  label: string;
  icon: IconName;
  group: string;
}

const n = (view: string, label: string, icon: IconName, group: string): NavItem => ({
  view,
  label,
  icon,
  group,
});

export const NAV: Record<Role, NavItem[]> = {
  ADMIN: [
    n("overview", "Overview", "grid", "Workspace"),
    n("clients", "Clients", "users", "Workspace"),
    n("cases", "Case Management", "briefcase", "Workspace"),
    n("staff", "Staff & Invitations", "userPlus", "Workspace"),
    n("projects", "Projects", "folder", "Workspace"),
    n("tasks", "Tasks & Deadlines", "tasks", "Workspace"),
    n("documents", "Documents", "file", "Work queues"),
    n("messages", "Messages", "msg", "Work queues"),
    n("reports", "CSR Reports", "clipboard", "Work queues"),
    n("announcements", "Announcements", "megaphone", "Work queues"),
    n("tickets", "Tickets", "ticket", "Work queues"),
    n("services", "Services", "layers", "Business"),
    n("analytics", "Reports & Analytics", "chart", "Business"),
    n("automation", "Notifications & Automation", "zap", "System"),
    n("security", "Audit & Security", "shield", "System"),
    n("settings", "Settings", "settings", "System"),
  ],
  MANAGER: [
    n("overview", "Overview", "grid", "Operations"),
    n("clients", "Clients", "users", "Operations"),
    n("cases", "Case Management", "briefcase", "Operations"),
    n("staff", "Team & Workload", "userPlus", "Operations"),
    n("projects", "Projects", "folder", "Operations"),
    n("tasks", "Tasks & Deadlines", "tasks", "Operations"),
    n("followups", "Follow-ups", "phone", "Operations"),
    n("documents", "Document Review", "file", "Work queues"),
    n("messages", "Messages", "msg", "Work queues"),
    n("reports", "CSR Reports", "clipboard", "Work queues"),
    n("announcements", "Announcements", "megaphone", "Work queues"),
    n("tickets", "Tickets", "ticket", "Work queues"),
    n("services", "Services", "layers", "Business"),
    n("analytics", "Reports & Analytics", "chart", "Business"),
    n("automation", "Notifications", "zap", "Settings"),
    n("settings", "Operational Settings", "settings", "Settings"),
  ],
  CSR: [
    n("overview", "Overview", "grid", "My work"),
    n("clients", "My Clients", "users", "My work"),
    n("staff", "Invitations", "userPlus", "My work"),
    n("projects", "Case Progress", "folder", "My work"),
    n("followups", "Follow-ups", "phone", "My work"),
    n("messages", "Messages", "msg", "Communication"),
    n("reports", "Compliance Reports", "clipboard", "Communication"),
    n("tickets", "Tickets", "ticket", "Communication"),
    n("help", "Help Center", "help", "Account"),
    n("settings", "Profile Settings", "settings", "Account"),
  ],
  COMPLIANCE: [
    n("overview", "Overview", "grid", "Compliance"),
    n("clients", "Clients & Cases", "users", "Compliance"),
    n("documents", "Document Review", "file", "Compliance"),
    n("requests", "Document Requests", "filePlus", "Compliance"),
    n("calendar", "Compliance Calendar", "calendar", "Compliance"),
    n("filings", "Filing Tracker", "flag", "Compliance"),
    n("projects", "Projects & Milestones", "folder", "Compliance"),
    n("messages", "Messages", "msg", "Communication"),
    n("reports", "CSR Reports", "clipboard", "Communication"),
    n("announcements", "Announcements", "megaphone", "Communication"),
    n("tickets", "Tickets", "ticket", "Communication"),
    n("help", "Help Center", "help", "Account"),
    n("settings", "Profile Settings", "settings", "Account"),
  ],
  CLIENT: [
    n("home", "Home", "home", ""),
    n("cdocs", "Documents", "file", ""),
    n("cmsgs", "Messages", "msg", ""),
    n("csettings", "Settings", "settings", ""),
  ],
};

/** The permission a role must hold to open a view. Views not listed are open to every role that lists them in NAV. */
export const VIEW_PERMISSION: Record<string, Permission | null> = {
  staff: null,
  documents: "docsManage",
  requests: "docsManage",
  tasks: "allTasks",
  announcements: "announce",
  automation: "manageTriggers",
  reports: "reportView",
  clients: "viewClients",
  projects: "viewProjects",
  tickets: "ticketsStaff",
  messages: "conversation",
  cases: "editCase",
  services: "viewServices",
  analytics: "analytics",
  security: "auditLog",
  followups: "followups",
  calendar: "filingTracker",
  filings: "filingTracker",
  help: "help",
};

/** Views that exist but are reached from inside another page rather than from the sidebar. */
export const HIDDEN_VIEWS = ["caseDetail"] as const;
