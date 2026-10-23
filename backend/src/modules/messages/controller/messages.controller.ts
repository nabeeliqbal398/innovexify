import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { CursorQueryDto } from "../../../common/pagination/cursor.dto";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { RateLimit, RateLimitGuard } from "../../../common/rate-limit/rate-limit.guard";
import { ApiResponse } from "../../../common/responses/api-response";
import { attachmentDisposition } from "../../../common/storage/file-policy";
import { UploadErrorsInterceptor } from "../../../common/storage/upload-errors.interceptor";
import { SendMessageDto } from "../dto/messages.dto";
import { MessagesService } from "../service/messages.service";

@ApiTags("messages")
@ApiBearerAuth()
@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get("clients/:clientId/messages")
  @ApiOperation({ summary: "A client's conversation by cursor: newest page by default, `before` for older, `since` for new ones" })
  list(@Param("clientId") clientId: string, @Query() query: CursorQueryDto, @Req() request: RequestContext) {
    return this.messages.list(actorContextOf(request), clientId, query);
  }

  @Post("clients/:clientId/messages")
  @RateLimit("messages")
  @UseGuards(RateLimitGuard)
  @ApiConsumes("application/json", "multipart/form-data")
  @UseInterceptors(UploadErrorsInterceptor, FileInterceptor("file"))
  @ApiOperation({ summary: "Send a message (text 1 to 5000; optional attachment in the multipart field `file`). Rate-limited per person." })
  async send(@Param("clientId") clientId: string, @Body() dto: SendMessageDto, @UploadedFile() file: Express.Multer.File | undefined, @Req() request: RequestContext) {
    return ApiResponse.of(await this.messages.send(actorContextOf(request), clientId, dto, file), "Message sent.");
  }

  @Post("clients/:clientId/messages/read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark the conversation read up to its newest message (safe to repeat)" })
  async read(@Param("clientId") clientId: string, @Req() request: RequestContext) {
    return ApiResponse.of(await this.messages.markRead(actorContextOf(request), clientId), "Marked as read.");
  }

  @Get("conversations")
  @ApiOperation({ summary: "The conversations you may see, unread first, with the last message and unread count" })
  conversations(@Query() query: PaginationQueryDto, @Req() request: RequestContext) {
    return this.messages.conversations(actorContextOf(request), query);
  }

  @Get("messages/unread-count")
  @ApiOperation({ summary: "How many unread messages you have across every conversation you can see" })
  unread(@Req() request: RequestContext) {
    return this.messages.unreadCount(actorContextOf(request));
  }

  @Get("messages/:id/attachment")
  @ApiOperation({ summary: "Download a message attachment (same scoping as the conversation; audited)" })
  async attachment(@Param("id") id: string, @Req() request: RequestContext, @Res({ passthrough: true }) response: Response) {
    const { file, fileName, mimeType } = await this.messages.attachment(actorContextOf(request), id);
    response.set({
      "Content-Type": mimeType,
      "Content-Disposition": attachmentDisposition(fileName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    return file;
  }
}
