"use client";

import { ProjectTasks } from "@/components/features/projects/project-tasks";
import { StagePanel } from "@/components/features/projects/stage-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/primitives";
import { CASE_TONE, STAGES } from "@/constants/vocab";
import { useData, useMe } from "@/hooks/useStore";
import { userName } from "@/store/selectors";
import type { Project, User } from "@/types/domain";

interface ProjectRowProps {
  project: Project;
  client: User;
  open: boolean;
  onToggle: () => void;
  onOpenCase: () => void;
}

export function ProjectRow({ project, client, open, onToggle, onOpenCase }: ProjectRowProps) {
  const data = useData();
  const me = useMe();
  const pct = Math.round(((project.stageIdx >= 10 ? 11 : project.stageIdx) / 11) * 100);
  const panelId = `project-${project.id}`;

  return (
    <div className="border-t border-muted first:border-t-0">
      <div className="row !border-t-0">
        <div className="min-w-0 flex-[1_1_240px]">
          <div className="font-semibold">
            {client.name} — {client.state || "—"}
          </div>
          <div className="help">
            <span className="mono">
              {project.id} · {client.caseId}
            </span>{" "}
            · CSR {userName(data, client.csr)}
          </div>
        </div>
        <span className="w-[190px] text-sm">{STAGES[project.stageIdx]}</span>
        <Badge tone={CASE_TONE[project.status] ?? "q"}>{project.status}</Badge>
        <div className="flex w-[130px] items-center gap-1.5">
          <Progress className="flex-1" value={pct} label={`${client.name} progress`} />
          <span className="mono help">{pct}%</span>
        </div>
        <Button size="sm" variant="ghost" onClick={onOpenCase}>
          Case
        </Button>
        <Button size="sm" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
          {open ? "Close" : me.role === "CSR" ? "View" : "Manage"}
        </Button>
      </div>
      {open ? (
        <div id={panelId} className="flex flex-col gap-3 px-3.5 pb-4 pt-1">
          <StagePanel project={project} />
          <ProjectTasks project={project} client={client} />
        </div>
      ) : null}
    </div>
  );
}
