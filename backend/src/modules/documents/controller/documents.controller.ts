import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";

import { actorContextOf } from "../../../common/interfaces/actor-context";
import type { RequestContext } from "../../../common/interfaces/request-context";
import { RequirePermission } from "../../../common/permissions/require-permission.decorator";
import { ApiResponse } from "../../../common/responses/api-response";
import { attachmentDisposition } from "../../../common/storage/file-policy";
import { UploadErrorsInterceptor } from "../../../common/storage/upload-errors.interceptor";
import { ListDocumentsQueryDto, RequestDocumentDto, ReviewDocumentDto, ShareDocumentDto } from "../dto/documents.dto";
import { DocumentsService } from "../service/documents.service";

@ApiTags("documents")
@ApiBearerAuth()
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: "List the documents you may see. A CSR sees status only; a client sees their own." })
  list(@Query() query: ListDocumentsQueryDto, @Req() request: RequestContext) {
    return this.documents.list(actorContextOf(request), query);
  }

  // Declared before the ":id" routes so "request" and "share" are never read as ids.
  @Post("request")
  @RequirePermission("docsManage")
  @ApiOperation({ summary: "Request a document from a client (Admin, Manager, Compliance). A repeat of an open request is refused." })
  async request(@Body() dto: RequestDocumentDto, @Req() request: RequestContext) {
    const doc = await this.documents.request(actorContextOf(request), dto);
    return ApiResponse.of(doc, `Requested “${doc.name}” from ${doc.client?.name ?? "the client"}.`);
  }

  @Post("share")
  @RequirePermission("docsManage")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(UploadErrorsInterceptor, FileInterceptor("file"))
  @ApiOperation({ summary: "Share a finished document with a client: multipart with `clientId`, optional `name` and the file in `file`" })
  async share(@Body() dto: ShareDocumentDto, @UploadedFile() file: Express.Multer.File | undefined, @Req() request: RequestContext) {
    const doc = await this.documents.share(actorContextOf(request), dto, file);
    return ApiResponse.of(doc, `Shared with ${doc.client?.name ?? "the client"}.`);
  }

  @Get(":id")
  @ApiOperation({ summary: "One document with its history. Outside your scope: 404." })
  get(@Param("id") id: string, @Req() request: RequestContext) {
    return this.documents.get(actorContextOf(request), id);
  }

  @Post(":id/upload")
  @HttpCode(HttpStatus.OK)
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(UploadErrorsInterceptor, FileInterceptor("file"))
  @ApiOperation({ summary: "A client uploads the file for a request (PDF, PNG, JPG or DOCX). Moves it to SUBMITTED." })
  async upload(@Param("id") id: string, @UploadedFile() file: Express.Multer.File | undefined, @Req() request: RequestContext) {
    return ApiResponse.of(await this.documents.upload(actorContextOf(request), id, file), "Submitted for review.");
  }

  @Post(":id/review")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("docsReview")
  @ApiOperation({ summary: "Approve, reject or ask for more information on a submitted document (a reason is required for reject and info)" })
  async review(@Param("id") id: string, @Body() dto: ReviewDocumentDto, @Req() request: RequestContext) {
    const message =
      dto.decision === "APPROVED"
        ? "Approved. The client was notified."
        : dto.decision === "REJECTED"
          ? "Rejected with your reason. The client was notified."
          : "More information requested. The client was notified.";
    return ApiResponse.of(await this.documents.review(actorContextOf(request), id, dto), message);
  }

  @Get(":id/download")
  @ApiOperation({ summary: "Download the file. Permission-checked and audited; never served statically." })
  async download(@Param("id") id: string, @Req() request: RequestContext, @Res({ passthrough: true }) response: Response) {
    const { file, fileName, mimeType } = await this.documents.download(actorContextOf(request), id);
    response.set({
      "Content-Type": mimeType,
      "Content-Disposition": attachmentDisposition(fileName),
      // The browser must treat the bytes as the type we state, never guess "it looks like HTML".
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    return file;
  }

  @Delete(":id")
  @RequirePermission("deleteDocument")
  @ApiOperation({ summary: "Delete a document (soft: the record and file are kept). Admin and Manager." })
  async remove(@Param("id") id: string, @Req() request: RequestContext) {
    return ApiResponse.of(await this.documents.remove(actorContextOf(request), id), "Document deleted. The record is kept.");
  }
}
