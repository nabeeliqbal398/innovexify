"use client";

import { useState } from "react";

import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Callout, Card, CardHeader, Facts } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { PREF_API_KEY } from "@/lib/api-mappers";
import { fmtAt } from "@/lib/dates";
import { usePreferencesQuery, useUpdatePreferenceMutation } from "@/store/api/auth";
import { useClientQuery } from "@/store/api/people";
import type { NotificationPrefs } from "@/types/domain";

const PREF_ROWS: ReadonlyArray<{ key: keyof NotificationPrefs; label: string }> = [
  { key: "msg", label: "Messages from your team" },
  { key: "docs", label: "Document requests and reviews" },
  { key: "stage", label: "Case progress updates" },
  { key: "tickets", label: "Ticket updates" },
  { key: "anns", label: "Announcements" },
];

const checkbox = "size-[18px] accent-primary";

export function NotificationsPanel() {
  const run = useAction();
  const prefs = usePreferencesQuery();
  const [update, { isLoading }] = useUpdatePreferenceMutation();
  const toggle = (key: keyof NotificationPrefs, channel: "email" | "app"): void => {
    const current = prefs.data?.[key];
    if (!current) return;
    void run(
      update({ category: PREF_API_KEY[key], ...(channel === "email" ? { email: !current.email } : { inApp: !current.app }) }),
      { success: "Preference saved" },
    );
  };
  return (
    <Card>
      <CardHeader title="Notification preferences" aside={<span className="help">Saved as soon as you change a box</span>} />
      <QueryState query={prefs} isEmpty={false} empty={{ title: "" }} rows={4}>
        <div className="tbl-wrap">
          <table className="min-w-[420px] w-full border-collapse [&_td]:border-b [&_td]:border-muted [&_td]:px-3 [&_td]:py-2.5 [&_td:not(:first-child)]:text-center [&_th]:px-3 [&_th]:py-[9px] [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground [&_th:not(:first-child)]:text-center [&_th]:text-left [&_thead]:bg-background">
            <thead>
              <tr>
                <th scope="col">Notify me about</th>
                <th scope="col">Email</th>
                <th scope="col">In-app</th>
              </tr>
            </thead>
            <tbody>
              {PREF_ROWS.map((p) => (
                <tr key={p.key}>
                  <td className="text-sm">{p.label}</td>
                  <td>
                    <input
                      type="checkbox"
                      className={checkbox}
                      checked={Boolean(prefs.data?.[p.key].email)}
                      disabled={isLoading}
                      onChange={() => toggle(p.key, "email")}
                      aria-label={`Email for ${p.label}`}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      className={checkbox}
                      checked={Boolean(prefs.data?.[p.key].app)}
                      disabled={isLoading}
                      onChange={() => toggle(p.key, "app")}
                      aria-label={`In-app for ${p.label}`}
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="text-sm">
                  Security notices <Badge tone="q">Always on</Badge>
                </td>
                <td>
                  <input type="checkbox" className={checkbox} checked disabled readOnly aria-label="Email for security notices, always on" />
                </td>
                <td>
                  <input type="checkbox" className={checkbox} checked disabled readOnly aria-label="In-app for security notices, always on" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </QueryState>
      <p className="help px-3.5 py-2.5">Switching email off stops the email only: you still see the notification in the portal.</p>
    </Card>
  );
}

export function AccountPanel() {
  const me = useMe();
  const profile = useClientQuery(me.id);
  const c = profile.data;
  return (
    <section className="card card-b">
      <span className="h3">Account information</span>
      <QueryState query={profile} isEmpty={false} empty={{ title: "" }} rows={3}>
        <Facts
          items={[
            { label: "Case ID", value: c?.caseId ?? me.caseId, mono: true },
            { label: "Login email", value: me.email },
            { label: "Business", value: c?.biz || "To be confirmed" },
            { label: "Formation state", value: c?.state || "To be confirmed" },
            { label: "Your CSR", value: c?.csrName ?? "Not assigned yet" },
            { label: "Account status", value: me.status },
            { label: "Member since", value: c?.joinedAt ? fmtAt(c.joinedAt) : "—" },
          ]}
        />
      </QueryState>
      <Callout tone="info" icon="lock">
        Case ID and login email can&apos;t be changed here. To change your login email, message your team; staff verify and update it.
      </Callout>
    </section>
  );
}

const FAQ: ReadonlyArray<readonly [string, string]> = [
  ["How do I upload a document?", "Open Documents, choose the request and upload a PDF, PNG, JPG or DOCX up to 25 MB."],
  ["Who can see my files?", "Only you and authorized Innovexify reviewers. Your CSR sees whether a document is approved, not the file itself."],
  ["How do I raise a problem?", "Use New ticket on Home. You can follow every reply and status change in the ticket center."],
  ["How do I change my login email?", "Message your team. For security, staff verify and change login emails."],
];

export function HelpPanel() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Card>
      <CardHeader title="Help" />
      {FAQ.map(([q, a], i) => (
        <div key={q} className="border-t border-muted">
          <button
            type="button"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-3 text-left font-medium hover:bg-background"
          >
            <span>{q}</span>
            <Icon name={open === i ? "chevD" : "chevR"} small />
          </button>
          {open === i ? <div className="px-3.5 pb-3.5 text-sm text-neutral">{a}</div> : null}
        </div>
      ))}
    </Card>
  );
}
