"use client";

import { AnalyticsView } from "@/components/features/analytics/analytics-view";
import { AnnouncementsView } from "@/components/features/announcements/announcements-view";
import { CaseDetail } from "@/components/features/cases/case-detail";
import { CasesView } from "@/components/features/cases/cases-view";
import { ClientDocumentsView } from "@/components/features/client/documents-view";
import { ClientHomeView } from "@/components/features/client/home-view";
import { ClientMessagesView } from "@/components/features/client/messages-view";
import { ClientSettingsView } from "@/components/features/client/settings-view";
import { ClientsView } from "@/components/features/clients/clients-view";
import { CalendarView } from "@/components/features/compliance/calendar-view";
import { FilingsView } from "@/components/features/compliance/filings-view";
import { DocumentsView } from "@/components/features/documents/documents-view";
import { FollowupsView } from "@/components/features/followups/followups-view";
import { MessagesView } from "@/components/features/messages/messages-view";
import { OverviewView } from "@/components/features/overview/overview-view";
import { ProjectsView } from "@/components/features/projects/projects-view";
import { ReportsView } from "@/components/features/reports/reports-view";
import { ServicesView } from "@/components/features/services/services-view";
import { StaffView } from "@/components/features/staff/staff-view";
import { AutomationView } from "@/components/features/system/automation-view";
import { HelpView } from "@/components/features/system/help-view";
import { SecurityView } from "@/components/features/system/security-view";
import { SettingsView } from "@/components/features/system/settings-view";
import { TasksView } from "@/components/features/tasks/tasks-view";
import { TicketsView } from "@/components/features/tickets/tickets-view";
import type { ViewProps } from "@/components/features/workspace/types";

/** Renders the page for a view id. A second path segment on `cases` or `clients` opens that case. */
export function ViewOutlet({ nav }: ViewProps) {
  if (nav.id && (nav.view === "cases" || nav.view === "clients")) {
    return <CaseDetail nav={nav} projectId={nav.id} />;
  }
  switch (nav.view) {
    case "overview":
      return <OverviewView nav={nav} />;
    case "clients":
      return <ClientsView nav={nav} />;
    case "cases":
      return <CasesView nav={nav} />;
    case "staff":
      return <StaffView nav={nav} />;
    case "projects":
      return <ProjectsView nav={nav} />;
    case "tasks":
      return <TasksView nav={nav} />;
    case "followups":
      return <FollowupsView nav={nav} />;
    case "documents":
    case "requests":
      return <DocumentsView nav={nav} />;
    case "calendar":
      return <CalendarView nav={nav} />;
    case "filings":
      return <FilingsView nav={nav} />;
    case "messages":
      return <MessagesView nav={nav} />;
    case "reports":
      return <ReportsView />;
    case "announcements":
      return <AnnouncementsView />;
    case "tickets":
      return <TicketsView nav={nav} />;
    case "services":
      return <ServicesView />;
    case "analytics":
      return <AnalyticsView />;
    case "automation":
      return <AutomationView />;
    case "security":
      return <SecurityView nav={nav} />;
    case "settings":
      return <SettingsView nav={nav} />;
    case "help":
      return <HelpView nav={nav} />;
    case "home":
      return <ClientHomeView nav={nav} />;
    case "cdocs":
      return <ClientDocumentsView nav={nav} />;
    case "cmsgs":
      return <ClientMessagesView />;
    case "csettings":
      return <ClientSettingsView nav={nav} />;
    default:
      return null;
  }
}
