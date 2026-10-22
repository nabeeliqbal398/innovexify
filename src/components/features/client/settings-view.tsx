"use client";

import { ContactForm, ProfileForm, SecurityPanel } from "@/components/features/client/settings-forms";
import { AccountPanel, HelpPanel, NotificationsPanel } from "@/components/features/client/settings-panels";
import type { ViewProps } from "@/components/features/workspace/types";
import { PageHeader, Tabs } from "@/components/ui/primitives";

const TABS = [
  { value: "profile", label: "Personal profile" },
  { value: "contact", label: "Contact information" },
  { value: "security", label: "Password & security" },
  { value: "notifications", label: "Notification preferences" },
  { value: "account", label: "Account information" },
  { value: "help", label: "Help" },
] as const;
type TabId = (typeof TABS)[number]["value"];

/** Client Settings: profile, contact, security, notifications, account facts and help. */
export function ClientSettingsView({ nav }: ViewProps) {
  const requested = nav.param("tab");
  const tab: TabId = TABS.find((t) => t.value === requested)?.value ?? "profile";

  return (
    <div className="stack-16">
      <PageHeader title="Settings" description="Your profile, contact details, security and notifications." />
      <Tabs
        label="Settings sections"
        options={TABS}
        value={tab}
        onChange={(v) => nav.setParams({ tab: v === "profile" ? undefined : v })}
      />
      {tab === "profile" ? <ProfileForm /> : null}
      {tab === "contact" ? <ContactForm /> : null}
      {tab === "security" ? <SecurityPanel /> : null}
      {tab === "notifications" ? <NotificationsPanel /> : null}
      {tab === "account" ? <AccountPanel /> : null}
      {tab === "help" ? <HelpPanel /> : null}
    </div>
  );
}
