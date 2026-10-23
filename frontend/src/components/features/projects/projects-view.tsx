"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import { CreateProjectForm } from "@/components/features/projects/create-project-form";
import { ProjectRow } from "@/components/features/projects/project-row";
import { useOpenCase } from "@/components/features/projects/use-open-case";
import type { ViewProps } from "@/components/features/workspace/types";
import { PageHeader } from "@/components/ui/primitives";
import { useMe } from "@/hooks/useStore";
import { can } from "@/lib/permissions";
import { useCasesQuery } from "@/store/api/cases";

const PAGE_SIZE = 8;

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
  const me = useMe();
  const openCase = useOpenCase(nav);
  const [page, setPage] = useState(1);
  const copy = me.role === "CSR" ? COPY.CSR : me.role === "COMPLIANCE" ? COPY.COMPLIANCE : COPY.DEFAULT;
  const openId = nav.param("project");
  const result = useCasesQuery({ page, limit: PAGE_SIZE, sort: "lastActivityAt", order: "desc" });
  const rows = result.data?.items ?? [];
  const meta = result.data?.meta;

  return (
    <div className="stack-16">
      <PageHeader title={copy.title} description={copy.sub} />
      {can(me, "manageProjects") ? <CreateProjectForm /> : null}
      <section className="card overflow-hidden" aria-label="Projects">
        <QueryState
          query={result}
          isEmpty={rows.length === 0}
          empty={{ title: "No projects yet", text: "Formation projects for clients in your scope appear here." }}
          rows={4}
        >
          {rows.map((project) => (
            <ProjectRow
              key={project.apiId}
              project={project}
              open={openId === project.apiId}
              onToggle={() => nav.setParams({ project: openId === project.apiId ? undefined : project.apiId })}
              onOpenCase={() => openCase(project.apiId)}
            />
          ))}
        </QueryState>
        {meta ? (
          <Pager
            page={meta.page - 1}
            pageCount={meta.totalPages}
            total={meta.total}
            pageSize={PAGE_SIZE}
            noun="projects"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        ) : null}
      </section>
    </div>
  );
}
