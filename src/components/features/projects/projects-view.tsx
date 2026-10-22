"use client";

import { CreateProjectForm } from "@/components/features/projects/create-project-form";
import { ProjectRow } from "@/components/features/projects/project-row";
import { useOpenCase } from "@/components/features/projects/use-open-case";
import type { ViewProps } from "@/components/features/workspace/types";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { useData, useMe } from "@/hooks/useStore";
import { can } from "@/lib/permissions";

const COPY = {
  CSR: {
    title: "Case progress",
    sub: "Read-only formation progress for your clients. Add follow-up tasks to keep track of client conversations.",
  },
  COMPLIANCE: {
    title: "Compliance milestones",
    sub: "You can move document milestones (Documents Pending → Ready for Filing) and add compliance tasks.",
  },
  DEFAULT: {
    title: "Projects",
    sub: "LLC formation projects. Moving past “State Approval Received” requires the state's filing confirmation.",
  },
} as const;

export function ProjectsView({ nav }: ViewProps) {
  const data = useData();
  const me = useMe();
  const openCase = useOpenCase(nav);
  const copy = me.role === "CSR" ? COPY.CSR : me.role === "COMPLIANCE" ? COPY.COMPLIANCE : COPY.DEFAULT;
  const openId = nav.param("project");

  const rows = data.projects.flatMap((project) => {
    const client = data.users.find((u) => u.id === project.client);
    return client && client.status !== "Removed" && can(me, "viewClient", client) ? [{ project, client }] : [];
  });

  return (
    <div className="stack-16">
      <PageHeader title={copy.title} description={copy.sub} />
      {can(me, "manageProjects") ? <CreateProjectForm /> : null}
      <section className="card overflow-hidden" aria-label="Projects">
        {rows.map(({ project, client }) => (
          <ProjectRow
            key={project.id}
            project={project}
            client={client}
            open={openId === project.id}
            onToggle={() => nav.setParams({ project: openId === project.id ? undefined : project.id })}
            onOpenCase={() => openCase(project.id)}
          />
        ))}
        {rows.length === 0 ? <EmptyState title="No projects yet" text="Formation projects for clients in your scope appear here." /> : null}
      </section>
    </div>
  );
}
