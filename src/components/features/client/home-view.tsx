"use client";

import { HomeMain } from "@/components/features/client/home-main";
import { TicketCenter } from "@/components/features/client/ticket-center";
import type { ViewProps } from "@/components/features/workspace/types";

/** Client Home: the case overview, with the ticket center as a sub-view (`?view=tickets`). */
export function ClientHomeView({ nav }: ViewProps) {
  return nav.param("view") === "tickets" ? <TicketCenter nav={nav} /> : <HomeMain nav={nav} />;
}
