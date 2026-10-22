"use client";

import { PageHeader, Tabs } from "@/components/ui/primitives";
import { useAppDispatch, useMe } from "@/hooks/useStore";
import { guard } from "@/store/actions/core";
import type { Role } from "@/types/domain";
import type { ViewProps } from "@/components/features/workspace/types";

import { BrandingForm } from "./branding-form";
import { DefaultsForm } from "./defaults-form";
import { ProfileForm } from "./profile-form";
import { SettingsAudit } from "./settings-audit";

type SettingsTab = "branding" | "defaults" | "audit" | "profile";

const TABS: Partial<Record<Role, ReadonlyArray<{ value: SettingsTab; label: string }>>> = {
  ADMIN: [
    { value: "branding", label: "Company branding" },
    { value: "defaults", label: "Case defaults" },
    { value: "audit", label: "Audit log" },
    { value: "profile", label: "My profile" },
  ],
  MANAGER: [
    { value: "defaults", label: "Operational settings" },
    { value: "profile", label: "My profile" },
  ],
};
const PROFILE_ONLY = [{ value: "profile" as const, label: "My profile" }];

const COPY: Partial<Record<Role, { title: string; sub: string }>> = {
  ADMIN: { title: "Settings", sub: "Company-wide settings, branding and audit log." },
  MANAGER: { title: "Settings", sub: "Operational settings. Branding and user removal are Admin-only." },
};

export function SettingsView(props: ViewProps) {
  const { nav } = props;
  const dispatch = useAppDispatch();
  const me = useMe();
  const tabs = TABS[me.role] ?? PROFILE_ONLY;
  const param = nav.param("tab");
  const tab = tabs.find((t) => t.value === param)?.value ?? tabs[0].value;
  const copy = COPY[me.role] ?? {
    title: "Profile settings",
    sub: "Your own profile. Company settings are limited to Admin and Manager.",
  };

  const pick = (next: SettingsTab) => {
    if (next === "audit" && !dispatch(guard("auditLog", undefined, "Opened audit log", "", { silent: true }))) return;
    nav.setParams({ tab: next });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={copy.title} description={copy.sub} />
      <Tabs label="Settings sections" options={tabs} value={tab} onChange={pick} />
      {tab === "branding" ? <BrandingForm /> : null}
      {tab === "defaults" ? <DefaultsForm /> : null}
      {tab === "audit" ? <SettingsAudit {...props} /> : null}
      {tab === "profile" ? <ProfileForm /> : null}
    </div>
  );
}
