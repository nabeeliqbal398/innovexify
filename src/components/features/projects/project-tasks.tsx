"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { QueryState } from "@/components/common/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { useCompleteTaskMutation, useCreateTaskMutation, useReopenTaskMutation, useTasksQuery } from "@/store/api/cases";
import type { Project, TaskType } from "@/types/domain";

const schema = z.object({
  title: z.string().trim().min(1, "Enter a task title.").max(200, "Keep the title under 200 characters."),
  vis: z.enum(["internal", "client"]),
});
type Values = z.infer<typeof schema>;

const tomorrow = (): string => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

export function ProjectTasks({ project }: { project: Project }) {
  const me = useMe();
  const run = useAction();
  const result = useTasksQuery({ caseId: project.apiId, limit: 50, sort: "due", order: "asc" });
  const [complete] = useCompleteTaskMutation();
  const [reopen] = useReopenTaskMutation();
  const [create, { isLoading }] = useCreateTaskMutation();
  const tasks = result.data?.items ?? [];
  const taskType: TaskType = me.role === "CSR" ? "CSR follow-up" : me.role === "COMPLIANCE" ? "Compliance" : "Operations";
  const canTask = me.role === "CSR" ? can(me, "followUpTask", { csr: project.csr }) : can(me, "complianceTask") || can(me, "manageProjects");
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isValid },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { title: "", vis: "internal" }, mode: "onChange" });

  const submit = handleSubmit(async (values) => {
    const outcome = await run(
      create({ caseId: project.apiId, title: values.title, visibility: values.vis === "client" ? "CLIENT" : "INTERNAL", ...(me.role === "ADMIN" || me.role === "MANAGER" ? { due: tomorrow() } : {}) }),
      { success: "Task added", setError, fields: ["title"] },
    );
    if (outcome.ok) reset({ title: "", vis: values.vis });
  });

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flabel">Tasks</span>
      <QueryState query={result} isEmpty={tasks.length === 0} empty={{ title: "No tasks on this case" }} rows={2}>
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.done}
              onChange={() => void run(t.done ? reopen(t.id) : complete(t.id))}
              aria-label={`Mark ${t.title} ${t.done ? "open again" : "done"}`}
              className="size-4 accent-primary"
            />
            <span className={cn("flex-1", t.done && "text-muted-foreground line-through")}>{t.title}</span>
            <Badge tone="q">{t.type}</Badge>
            <Badge tone={t.vis === "client" ? "brand" : "q"}>{t.vis === "client" ? "Visible to client" : "Internal"}</Badge>
            <span className="help">{t.byName}</span>
          </div>
        ))}
      </QueryState>
      {canTask ? (
        <form onSubmit={submit} noValidate className="flex flex-wrap gap-1.5">
          <Input
            aria-label="New task"
            className="flex-[1_1_200px]"
            placeholder={me.role === "CSR" ? "Follow-up, e.g. Call client about missing info" : "Task title"}
            {...register("title")}
          />
          <Select aria-label="Visibility" className="w-auto" {...register("vis")}>
            <option value="internal">Internal only</option>
            <option value="client">Visible to client</option>
          </Select>
          <Button type="submit" size="sm" className="h-[34px]" disabled={!isValid || isLoading}>
            {isLoading ? "Adding…" : `Add ${taskType} task`}
          </Button>
          {errors.title && errors.title.message !== "Enter a task title." ? (
            <span role="alert" className="errtxt basis-full">
              {errors.title.message}
            </span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
