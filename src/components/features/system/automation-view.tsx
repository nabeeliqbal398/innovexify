"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/primitives";
import { can } from "@/lib/permissions";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";

import { manageTemplates, manageTriggers } from "./actions";

export function AutomationView() {
  const dispatch = useAppDispatch();
  const data = useData();
  const me = useMe();
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
        {data.triggers.map((t) => (
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
              disabled={t.security}
              onClick={() => dispatch(manageTriggers(t))}
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
              disabled={!canTemplates}
              onChange={(e) => dispatch(manageTemplates(t, e.target.value))}
            >
              {t.opts.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </section>
      {!canTemplates ? (
        <p className="help flex items-center gap-1.5">
          <Icon name="lock" small />
          Template choices are locked: only Admin can change email templates.
        </p>
      ) : null}
    </div>
  );
}
