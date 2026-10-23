import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import { CreateTaskDto, ListTasksQueryDto, UpdateTaskDto } from "../dto/tasks.dto";
import { TasksService } from "../service/tasks.service";

@ApiTags("tasks")
@ApiBearerAuth()
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: "List the tasks you may see (filters, search, sort, pagination). A client sees only tasks marked for them." })
  list(@Query() query: ListTasksQueryDto, @Req() request: RequestContext) {
    return this.tasks.list(actorContextOf(request), query);
  }

  @Get(":id")
  @ApiOperation({ summary: "One task. Outside your scope: 404." })
  get(@Param("id") id: string, @Req() request: RequestContext) {
    return this.tasks.get(actorContextOf(request), id);
  }

  @Post()
  @ApiOperation({ summary: "Add a task to a case. Admin and Manager choose any active staff member; CSR and Compliance assign to themselves." })
  async create(@Body() dto: CreateTaskDto, @Req() request: RequestContext) {
    const task = await this.tasks.create(actorContextOf(request), dto);
    return ApiResponse.of(task, task.visibility === "CLIENT" ? "Task added and visible to the client." : `Task added and assigned to ${task.assignee.name}.`);
  }

  @Patch(":id")
  @RequirePermission("manageTasks")
  @ApiOperation({ summary: "Change title, due date, priority, assignee or visibility (Admin and Manager)" })
  async update(@Param("id") id: string, @Body() dto: UpdateTaskDto, @Req() request: RequestContext) {
    return ApiResponse.of(await this.tasks.update(actorContextOf(request), id, dto), "Task saved.");
  }

  @Post(":id/complete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark a task done (records who and when). Doing it again changes nothing." })
  async complete(@Param("id") id: string, @Req() request: RequestContext) {
    const { task, changed } = await this.tasks.complete(actorContextOf(request), id);
    return ApiResponse.of(
      task,
      changed ? "Task completed." : `This task was already completed${task.completedBy ? ` by ${task.completedBy.name}` : ""}. Nothing was changed.`,
    );
  }

  @Post(":id/reopen")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reopen a completed task. Doing it on an open task changes nothing." })
  async reopen(@Param("id") id: string, @Req() request: RequestContext) {
    const { task, changed } = await this.tasks.reopen(actorContextOf(request), id);
    return ApiResponse.of(task, changed ? "Task reopened." : "This task is already open. Nothing was changed.");
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a task: only its creator, an Admin or a Manager" })
  async remove(@Param("id") id: string, @Req() request: RequestContext) {
    return ApiResponse.of(await this.tasks.remove(actorContextOf(request), id), "Task deleted.");
  }
}
