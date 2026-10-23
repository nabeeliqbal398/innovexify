import { Injectable } from "@nestjs/common";
import { Prisma, type Role, type TaskType } from "@prisma/client";

import { AuditService } from "../../../common/audit/audit.service";
import { formatCaseDisplay } from "../../../common/counter/counter.service";
import {
  CaseCompletedException,
  CaseDeletedException,
  DuplicateDocumentRequestException,
  InvalidTaskAssigneeException,
  PermissionDeniedException,
  ResourceNotFoundException,
  TaskAssigneeNotAllowedException,
  TaskDeleteNotAllowedException,
  TaskDueDateInvalidException,
  ValidationFailedException,
} from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { NotificationService } from "../../../common/notifications/notification.service";
import { paginate, parseSort } from "../../../common/pagination/paginate";
import { AccessService } from "../../../common/permissions/access.service";
import type { Permission } from "../../../common/permissions/permissions";
import type { PaginatedResponse } from "../../../common/responses/api-response";
import { findDuplicateRequest } from "../../../common/rules/duplicate-document";
import { caseScope, taskScope } from "../../../common/scope/scope";
import { addDays, isoDay, todayUtc } from "../../../common/utils/dates";
import { dateOnly } from "../../../common/validators/iso-date";
import type { CreateTaskDto, ListTasksQueryDto, TaskDto, UpdateTaskDto } from "../dto/tasks.dto";
import { EARLIEST_DUE_DATE, TASK_SORT_FIELDS, type TaskRecord } from "../interfaces/tasks.interfaces";
import { TasksRepository, type CaseForTask } from "../repository/tasks.repository";

type Db = Prisma.TransactionClient;

/** How many days from today a CSR's or Compliance user's task is due when they don't say (the prototype's default). */
const DEFAULT_DUE_DAYS = 3;

const ROLE_PHRASE: Record<Role, string> = { ADMIN: "an Admin", MANAGER: "a Manager", CSR: "a CSR", COMPLIANCE: "a Compliance user", CLIENT: "a client" };

/** The task type follows who does the work (the prototype's createTask rule). */
const typeFor = (role: Role): TaskType => (role === "COMPLIANCE" ? "COMPLIANCE" : role === "CSR" ? "CSR_FOLLOW_UP" : "OPERATIONS");

export function toTaskDto(task: TaskRecord, today: Date = todayUtc()): TaskDto {
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    visibility: task.visibility,
    priority: task.priority,
    due: isoDay(task.due) ?? "",
    done: task.done,
    overdue: !task.done && task.due.getTime() < today.getTime(),
    case: {
      id: task.case.id,
      number: task.case.number,
      displayNumber: formatCaseDisplay(task.case.number),
      client: { id: task.case.client.id, name: task.case.client.name },
    },
    assignee: task.assignee,
    createdBy: task.createdBy,
    completedBy: task.completedBy,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
  };
}

@Injectable()
export class TasksService {
  constructor(
    private readonly repo: TasksRepository,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly notifications: NotificationService,
  ) {}

  // ---- reads --------------------------------------------------------------------------------------------------

  async list(c: ActorContext, query: ListTasksQueryDto): Promise<PaginatedResponse<TaskDto>> {
    const sort = parseSort(query, TASK_SORT_FIELDS, { field: "due", order: "asc" });
    const today = todayUtc();
    const search = query.search?.trim();
    const number = search ? /^(?:prj-?)?(\d{1,9})$/i.exec(search)?.[1] : undefined;

    // "Overdue" and friends are computed here, from the server's date, never from what the caller's clock says.
    const when: Prisma.TaskWhereInput[] = [];
    if (query.filter === "overdue") when.push({ done: false, due: { lt: today } });
    if (query.filter === "today") when.push({ done: false, due: today });
    if (query.filter === "week") when.push({ done: false, due: { gte: today, lte: addDays(today, 7) } });
    if (query.filter === "upcoming") when.push({ done: false, due: { gt: today } });
    if (query.filter === "mine") when.push({ assigneeId: c.actor.id });
    if (query.dueFrom && query.dueTo && query.dueFrom > query.dueTo) throw new ValidationFailedException([{ field: "dueTo", message: "dueTo can't be before dueFrom." }]);
    if (query.dueFrom || query.dueTo) when.push({ due: { ...(query.dueFrom ? { gte: dateOnly(query.dueFrom) } : {}), ...(query.dueTo ? { lte: dateOnly(query.dueTo) } : {}) } });

    const where: Prisma.TaskWhereInput = {
      AND: [
        taskScope(c.actor),
        ...when,
        ...(query.caseId ? [{ caseId: query.caseId }] : []),
        ...(query.assigneeId ? [{ assigneeId: query.assigneeId }] : []),
        ...(query.type ? [{ type: query.type }] : []),
        ...(query.priority ? [{ priority: query.priority }] : []),
        ...(query.done !== undefined ? [{ done: query.done }] : []),
        ...(search
          ? [
              {
                OR: [
                  { title: { contains: search, mode: "insensitive" as const } },
                  { case: { is: { client: { is: { name: { contains: search, mode: "insensitive" as const } } } } } },
                  ...(number ? [{ case: { is: { number: Number(number) } } }] : []),
                ],
              },
            ]
          : []),
      ],
    };
    const orderBy: Prisma.TaskOrderByWithRelationInput[] = [{ [sort.field]: sort.order }, { id: "asc" }];
    return paginate(query, ({ skip, take }) => this.repo.page(where, orderBy, skip, take), (task) => toTaskDto(task, today));
  }

  async get(c: ActorContext, id: string): Promise<TaskDto> {
    return toTaskDto(await this.require(c, id));
  }

  // ---- create -------------------------------------------------------------------------------------------------

  async create(c: ActorContext, dto: CreateTaskDto): Promise<TaskDto> {
    this.refuseClient(c);
    const theCase = await this.repo.findCase({ AND: [{ id: dto.caseId }, caseScope(c.actor, { includeRemoved: true })] });
    if (!theCase) throw new ResourceNotFoundException("case", dto.caseId);
    await this.assertMayWork(c, theCase);

    const display = formatCaseDisplay(theCase.number);
    if (theCase.deletedAt) throw new CaseDeletedException(display);
    if (theCase.stage === "COMPLETED") throw new CaseCompletedException(display, "task");

    const assignee = await this.resolveAssignee(c, dto.assigneeId ?? c.actor.id);
    const due = this.resolveDue(c, dto.due);
    const duplicate = findDuplicateRequest(dto.title, await this.repo.openDocumentRequests(theCase.clientId));
    if (duplicate) throw new DuplicateDocumentRequestException(duplicate.name, "task");

    const visibility = dto.visibility ?? "INTERNAL";
    const created = await this.repo.transaction(async (tx) => {
      const row = await this.repo.create(
        {
          caseId: theCase.id,
          title: dto.title,
          type: typeFor(assignee.role),
          visibility,
          priority: dto.priority ?? "NORMAL",
          due: dateOnly(due),
          createdById: c.actor.id,
          assigneeId: assignee.id,
        },
        tx,
      );
      if (assignee.id !== c.actor.id) {
        await this.notifications.notify(tx, { userIds: [assignee.id], text: `Task assigned to you: ${dto.title}`, link: assignee.role === "CSR" || assignee.role === "COMPLIANCE" ? "projects" : "tasks" });
      }
      if (visibility === "CLIENT") await this.notifications.notify(tx, { userIds: [theCase.clientId], text: `New task: ${dto.title}`, link: "home" });
      await this.record(c, `Created task “${dto.title}” for ${assignee.name}`, theCase, tx);
      return row;
    });
    return toTaskDto(await this.requireById(created.id));
  }

  // ---- edit ---------------------------------------------------------------------------------------------------

  /** Admin and Manager (`manageTasks`): title, due date, priority, assignee, visibility. */
  async update(c: ActorContext, id: string, dto: UpdateTaskDto): Promise<TaskDto> {
    const task = await this.require(c, id);
    await this.access.assert(c.actor, "manageTasks", undefined, c.requestId, task.case.client.clientProfile?.caseNumber ?? "");

    const sent = (["title", "due", "priority", "assigneeId", "visibility"] as const).filter((f) => dto[f] !== undefined);
    if (sent.length === 0) throw new ValidationFailedException([{ field: "body", message: "Send at least one field to change." }]);

    const data: Prisma.TaskUncheckedUpdateInput = {};
    const changes: string[] = [];
    if (dto.title !== undefined && dto.title !== task.title) {
      data.title = dto.title;
      changes.push("title");
    }
    if (dto.due !== undefined && dto.due !== isoDay(task.due)) {
      this.assertDueDate(dto.due);
      data.due = dateOnly(dto.due);
      changes.push(`due ${dto.due}`);
    }
    if (dto.priority !== undefined && dto.priority !== task.priority) {
      data.priority = dto.priority;
      changes.push(`priority ${dto.priority}`);
    }
    if (dto.visibility !== undefined && dto.visibility !== task.visibility) {
      data.visibility = dto.visibility;
      changes.push(`visibility ${dto.visibility}`);
    }
    let newAssignee: { id: string; name: string; role: Role } | null = null;
    if (dto.assigneeId !== undefined && dto.assigneeId !== task.assigneeId) {
      newAssignee = await this.resolveAssignee(c, dto.assigneeId);
      data.assigneeId = newAssignee.id;
      data.type = typeFor(newAssignee.role);
      changes.push(`assignee ${newAssignee.name}`);
    }
    if (changes.length === 0) return toTaskDto(task);

    await this.repo.transaction(async (tx) => {
      await this.repo.update(task.id, data, tx);
      if (newAssignee && newAssignee.id !== c.actor.id) {
        const title = dto.title ?? task.title;
        await this.notifications.notify(tx, { userIds: [newAssignee.id], text: `Task assigned to you: ${title}`, link: "tasks" });
      }
      await this.record(c, `Edited task “${task.title}” (${changes.join(", ")})`, task.case, tx);
    });
    return toTaskDto(await this.requireById(task.id));
  }

  // ---- complete / reopen --------------------------------------------------------------------------------------

  async complete(c: ActorContext, id: string): Promise<{ task: TaskDto; changed: boolean }> {
    return this.setDone(c, id, true);
  }

  async reopen(c: ActorContext, id: string): Promise<{ task: TaskDto; changed: boolean }> {
    return this.setDone(c, id, false);
  }

  /** Idempotent: doing it twice is not an error, the second call just reports that nothing changed. */
  private async setDone(c: ActorContext, id: string, done: boolean): Promise<{ task: TaskDto; changed: boolean }> {
    this.refuseClient(c);
    const task = await this.require(c, id);
    await this.assertMayWork(c, task.case);

    const changed = await this.repo.transaction(async (tx) => {
      const moved = await this.repo.setDone(task.id, done, c.actor.id, tx);
      if (moved) await this.record(c, `${done ? "Completed" : "Reopened"} task ${task.title}`, task.case, tx);
      return moved;
    });
    return { task: toTaskDto(await this.requireById(task.id)), changed };
  }

  // ---- delete -------------------------------------------------------------------------------------------------

  async remove(c: ActorContext, id: string): Promise<TaskDto> {
    const task = await this.require(c, id);
    const mayDelete = task.createdById === c.actor.id || c.actor.role === "ADMIN" || c.actor.role === "MANAGER";
    if (!mayDelete) {
      await this.audit.record({ actorId: c.actor.id, actorRole: c.actor.role, action: `Refused: delete task ${task.title}`, target: task.case.client.clientProfile?.caseNumber ?? "", ok: false, category: "cases", requestId: c.requestId });
      throw new TaskDeleteNotAllowedException();
    }
    const dto = toTaskDto(task);
    await this.repo.transaction(async (tx) => {
      await this.repo.remove(task.id, tx);
      await this.record(c, `Deleted task “${task.title}”`, task.case, tx);
    });
    return dto;
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  /** A task the caller may see. Anything else is a 404, the same as one that doesn't exist. */
  private async require(c: ActorContext, id: string): Promise<TaskRecord> {
    const task = await this.repo.findOne({ AND: [{ id }, taskScope(c.actor)] });
    if (!task) throw new ResourceNotFoundException("task", id);
    return task;
  }

  private async requireById(id: string, db?: Db): Promise<TaskRecord> {
    const task = await this.repo.findById(id, db);
    if (!task) throw new ResourceNotFoundException("task", id);
    return task;
  }

  /** Clients see the tasks marked for them, but never change any: their team does. */
  private refuseClient(c: ActorContext): void {
    if (c.actor.role === "CLIENT") {
      throw new PermissionDeniedException("Tasks marked for you are there to keep you informed. Your team creates and completes them.");
    }
  }

  /** The prototype's taskPermission: a CSR works on their own clients' cases, Compliance on compliance tasks, Admin and Manager on any. */
  private async assertMayWork(c: ActorContext, theCase: Pick<CaseForTask, "client">): Promise<void> {
    const perm: Permission = c.actor.role === "CSR" ? "followUpTask" : c.actor.role === "COMPLIANCE" ? "complianceTask" : "manageTasks";
    await this.access.assert(c.actor, perm, { csr: theCase.client.clientProfile?.csrId ?? null }, c.requestId, theCase.client.clientProfile?.caseNumber ?? "");
  }

  /** An active staff member, and one this actor may give work to. */
  private async resolveAssignee(c: ActorContext, assigneeId: string): Promise<{ id: string; name: string; role: Role }> {
    const user = await this.repo.findUser(assigneeId);
    if (!user || user.role === "CLIENT" || user.status !== "ACTIVE") throw new InvalidTaskAssigneeException();
    const mayAssignAnyone = c.actor.role === "ADMIN" || c.actor.role === "MANAGER";
    if (!mayAssignAnyone && user.id !== c.actor.id) throw new TaskAssigneeNotAllowedException(ROLE_PHRASE[c.actor.role]);
    return user;
  }

  private resolveDue(c: ActorContext, due: string | undefined): string {
    if (!due) {
      if (c.actor.role === "ADMIN" || c.actor.role === "MANAGER") {
        throw new ValidationFailedException([{ field: "due", message: "Choose a due date." }]);
      }
      return isoDay(addDays(todayUtc(), DEFAULT_DUE_DAYS)) as string;
    }
    this.assertDueDate(due);
    return due;
  }

  private assertDueDate(due: string): void {
    if (due < EARLIEST_DUE_DATE) throw new TaskDueDateInvalidException(due);
  }

  private record(c: ActorContext, action: string, theCase: Pick<CaseForTask, "client">, tx: Db): Promise<void> {
    return this.audit.record(
      { actorId: c.actor.id, actorRole: c.actor.role, action, target: theCase.client.clientProfile?.caseNumber ?? "", category: "cases", requestId: c.requestId, ipAddress: c.ipAddress },
      tx,
    );
  }
}
