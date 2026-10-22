import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DocStatus, DocType } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);

export class ListDocumentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "clientId must be a client id." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId?: string;

  @ApiPropertyOptional({ enum: DocStatus })
  @IsOptional()
  @IsEnum(DocStatus, { message: `status must be one of: ${Object.values(DocStatus).join(", ")}.` })
  status?: DocStatus;

  @ApiPropertyOptional({ enum: DocType })
  @IsOptional()
  @IsEnum(DocType, { message: `type must be one of: ${Object.values(DocType).join(", ")}.` })
  type?: DocType;

  @ApiPropertyOptional({ description: "Matches the document name or the client's name (and, for staff who may see it, the file name)." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "search must be text." })
  @MaxLength(100, { message: "search can't be longer than 100 characters." })
  search?: string;
}

export class RequestDocumentDto {
  @ApiProperty({ description: "The client the document is requested from." })
  @Transform(trim)
  @IsString({ message: "Choose a client." })
  @IsNotEmpty({ message: "Choose a client." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId!: string;

  @ApiProperty({ maxLength: 200, example: "Proof of address" })
  @Transform(trim)
  @IsString({ message: "Enter a document name." })
  @IsNotEmpty({ message: "Enter a document name." })
  @MaxLength(200, { message: "The document name can't be longer than 200 characters." })
  name!: string;

  @ApiPropertyOptional({ enum: DocType, default: DocType.OTHER })
  @IsOptional()
  @IsEnum(DocType, { message: `type must be one of: ${Object.values(DocType).join(", ")}.` })
  type?: DocType;

  @ApiPropertyOptional({ maxLength: 500, description: "Instructions the client will see." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The note must be text." })
  @MaxLength(500, { message: "The note can't be longer than 500 characters." })
  note?: string;
}

/** The text fields of the multipart share request. The file travels in the form field named `file`. */
export class ShareDocumentDto {
  @ApiProperty({ description: "The client the document is shared with." })
  @Transform(trim)
  @IsString({ message: "Choose a client first." })
  @IsNotEmpty({ message: "Choose a client first." })
  @MaxLength(40, { message: "clientId is too long." })
  clientId!: string;

  @ApiPropertyOptional({ maxLength: 200, description: "Defaults to the file name." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The document name must be text." })
  @MaxLength(200, { message: "The document name can't be longer than 200 characters." })
  name?: string;
}

export class ReviewDocumentDto {
  @ApiProperty({ enum: ["APPROVED", "REJECTED", "INFO"] })
  @IsIn(["APPROVED", "REJECTED", "INFO"], { message: "decision must be APPROVED, REJECTED or INFO (more information needed)." })
  decision!: "APPROVED" | "REJECTED" | "INFO";

  @ApiPropertyOptional({ maxLength: 1000, description: "Required for REJECTED and INFO. The client sees it." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "The reason must be text." })
  @MaxLength(1000, { message: "The reason can't be longer than 1000 characters." })
  reason?: string;
}

export class DocumentEventDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: DocStatus }) status!: DocStatus;
  @ApiProperty() note!: string;
  @ApiProperty() at!: Date;
  @ApiPropertyOptional({ description: "Staff only." }) by?: { id: string; name: string };
}

/**
 * One shape for every role; fields a role may not see are simply absent.
 *   Staff (Admin, Manager, Compliance): everything below.
 *   CSR: identity and status only (the permission table keeps document contents and reasons from them).
 *   Client: their own, without who requested or reviewed it.
 * `storageKey` is never part of any response.
 */
export class DocumentDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: DocType }) type!: DocType;
  @ApiProperty({ enum: DocStatus }) status!: DocStatus;
  @ApiProperty() clientId!: string;
  @ApiPropertyOptional() client?: { id: string; name: string; caseNumber: string };
  @ApiPropertyOptional() fileName?: string;
  @ApiPropertyOptional() mimeType?: string | null;
  @ApiPropertyOptional() sizeBytes?: number | null;
  @ApiPropertyOptional({ description: "Why it was rejected or what is missing. Not shown to CSRs." }) reason?: string;
  @ApiPropertyOptional({ description: "The request's instructions. Not shown to CSRs." }) note?: string;
  @ApiPropertyOptional({ description: "Staff only." }) requestedBy?: { id: string; name: string } | null;
  @ApiPropertyOptional({ description: "Staff only." }) reviewedBy?: { id: string; name: string } | null;
  @ApiProperty() requestedAt!: Date;
  @ApiProperty({ nullable: true }) submittedAt!: Date | null;
  @ApiProperty({ nullable: true }) reviewedAt!: Date | null;
  @ApiPropertyOptional({ description: "Set when deleted. Only Admin and Manager can still open a deleted document." }) deletedAt?: Date | null;
  @ApiPropertyOptional({ type: [DocumentEventDto] }) history?: DocumentEventDto[];
}
