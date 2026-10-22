"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { can } from "@/lib/permissions";
import { addProjectTask, toggleTask } from "@/store/actions/cases";
import { userName } from "@/store/selectors";
import type { Project, TaskType, User } from "@/types/domain";

const schema = z.object({
  title: z.string().trim().min(1, "Enter a task title."),
  vis: z.enum(["internal", "client"]),
});
type Values = z.infer<typeof schema>;

export function ProjectTasks({ project, client }: { project: Project; client: User }) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const tasks = data.tasks.filter((t) => t.project === project.id);
  const taskType: TaskType = me.role === "CSR" ? "CSR follow-up" : me.role === "COMPLIANCE" ? "Compliance" : "Operations";
  const canTask = me.role === "CSR" ? can(me, "followUpTask", client) : can(me, "complianceTask", client) || can(me, "manageProjects");
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isValid },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { title: "", vis: "internal" }, mode: "onChange" });

  const submit = handleSubmit((values) => {
    const result = dispatch(addProjectTask(project.id, values.title, taskType, values.vis));
    if (result.ok) reset({ title: "", vis: values.vis });
    else if (result.error) setError("title", { message: result.error });
  });

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flabel">Tasks</span>
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={t.done}
            onChange={() => dispatch(toggleTask(t.id))}
            aria-label={`Mark ${t.title} done`}
            className="size-4 accent-primary"
          />
          <span className={cn("flex-1", t.done && "text-muted-foreground line-through")}>{t.title}</span>
          <Badge tone="q">{t.type}</Badge>
          <Badge tone={t.vis === "client" ? "brand" : "q"}>{t.vis === "client" ? "Visible to client" : "Internal"}</Badge>
          <span className="help">{userName(data, t.by)}</span>
        </div>
      ))}
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
          <Button type="submit" size="sm" className="h-[34px]" disabled={!isValid}>
            Add {taskType} task
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
