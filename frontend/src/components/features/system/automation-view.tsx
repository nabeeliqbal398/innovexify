"use client";

import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/primitives";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { can } from "@/lib/permissions";
import { useTriggersQuery, useUpdateTriggerMutation } from "@/store/api/system";

export function AutomationView() {
  const me = useMe();
  const run = useAction();
  const triggers = useTriggersQuery();
  const [update, { isLoading, originalArgs }] = useUpdateTriggerMutation();
  const canTemplates = can(me, "manageTemplates");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Notifications & automation"
        description={
          me.role === "ADMIN"
            ? "Turn triggers on or off and choose email templates. Security notifications are always on."
            : "Managers can turn operational triggers on or off. Email templates are Admin-only."
        }
      />
      <section className="card overflow-hidden">
        <QueryState query={triggers} isEmpty={(triggers.data ?? []).length === 0} empty={{ title: "No triggers" }} rows={4}>
          {(triggers.data ?? []).map((t) => {
            const busy = isLoading && originalArgs?.key === t.k;
            return (
              <div key={t.k} className="row">
                <span className="flex-[1_1_200px] font-medium">
                  {t.name}
                  {t.security ? (
                    <>
                      {" "}
                      <Badge tone="q">Required</Badge>
                    </>
                  ) : null}
                </span>
                <Button
                  size="sm"
                  variant={t.on ? "primary" : "default"}
                  aria-pressed={t.on}
                  aria-label={`${t.name}: ${t.on ? "on" : "off"}`}
                  disabled={t.security || busy}
                  onClick={() => void run(update({ key: t.k, enabled: !t.on }), { success: `${t.name} turned ${t.on ? "off" : "on"}. In-app notifications are not affected.` })}
                >
                  {t.on ? "On" : "Off"}
                </Button>
                <label className="help" htmlFor={`tpl-${t.k}`}>
                  Email template
                </label>
                <Select
                  id={`tpl-${t.k}`}
                  className="!w-auto"
                  value={t.tpl}
                  disabled={!canTemplates || busy}
                  onChange={(e) => void run(update({ key: t.k, template: e.target.value }), { success: "Template saved." })}
                >
                  {t.opts.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </div>
            );
          })}
        </QueryState>
      </section>
      <p className="help flex items-center gap-1.5">
        <Icon name="alert" small />A trigger that is off stops its email only: the in-app notification is still created.
      </p>
      {!canTemplates ? (
        <p className="help flex items-center gap-1.5">
          <Icon name="lock" small />
          Template choices are locked: only Admin can change email templates.
        </p>
      ) : null}
    </div>
  );
}
