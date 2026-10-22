import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CaseStage } from "@prisma/client";
import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);
const trimAll = ({ value }: { value: unknown }): unknown => (Array.isArray(value) ? value.map((v) => (typeof v === "string" ? v.trim() : v)) : value);
const STAGES = Object.values(CaseStage);

export class CreateServiceDto {
  @ApiProperty({ example: "LLC formation" })
  @Transform(trim)
  @IsString({ message: "name must be text." })
  @MinLength(2, { message: "The service name must be at least 2 characters." })
  @MaxLength(120, { message: "The service name can't be longer than 120 characters." })
  name!: string;

  @ApiProperty({ example: "Formation" })
  @Transform(trim)
  @IsString({ message: "category must be text." })
  @MinLength(2, { message: "The category must be at least 2 characters." })
  @MaxLength(40, { message: "The category can't be longer than 40 characters." })
  category!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString({ message: "description must be text." })
  @MinLength(2, { message: "Add a short description." })
  @MaxLength(500, { message: "The description can't be longer than 500 characters." })
  description!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(trimAll)
  @IsArray({ message: "requirements must be a list of text." })
  @ArrayMaxSize(30, { message: "A service can list at most 30 requirements." })
  @IsString({ each: true, message: "Each requirement must be text." })
  @MaxLength(200, { each: true, message: "A requirement can't be longer than 200 characters." })
  requirements?: string[];

  @ApiProperty({ enum: CaseStage, isArray: true, description: "The stages a case for this service moves through." })
  @IsArray({ message: "stages must be a list of stage names." })
  @ArrayNotEmpty({ message: "Choose at least one stage." })
  @IsEnum(CaseStage, { each: true, message: `Each stage must be one of: ${STAGES.join(", ")}.` })
  stages!: CaseStage[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "turnaround must be text." })
  @MaxLength(80, { message: "The turnaround can't be longer than 80 characters." })
  turnaround?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "fee must be text." })
  @MaxLength(80, { message: "The fee can't be longer than 80 characters." })
  fee?: string;
}

export class UpdateServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "name must be text." })
  @MinLength(2, { message: "The service name must be at least 2 characters." })
  @MaxLength(120, { message: "The service name can't be longer than 120 characters." })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "category must be text." })
  @MinLength(2, { message: "The category must be at least 2 characters." })
  @MaxLength(40, { message: "The category can't be longer than 40 characters." })
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "description must be text." })
  @MinLength(2, { message: "Add a short description." })
  @MaxLength(500, { message: "The description can't be longer than 500 characters." })
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(trimAll)
  @IsArray({ message: "requirements must be a list of text." })
  @ArrayMaxSize(30, { message: "A service can list at most 30 requirements." })
  @IsString({ each: true, message: "Each requirement must be text." })
  @MaxLength(200, { each: true, message: "A requirement can't be longer than 200 characters." })
  requirements?: string[];

  @ApiPropertyOptional({ enum: CaseStage, isArray: true })
  @IsOptional()
  @IsArray({ message: "stages must be a list of stage names." })
  @ArrayNotEmpty({ message: "Choose at least one stage." })
  @IsEnum(CaseStage, { each: true, message: `Each stage must be one of: ${STAGES.join(", ")}.` })
  stages?: CaseStage[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "turnaround must be text." })
  @MaxLength(80, { message: "The turnaround can't be longer than 80 characters." })
  turnaround?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "fee must be text." })
  @MaxLength(80, { message: "The fee can't be longer than 80 characters." })
  fee?: string;
}

export class ServiceDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() category!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: [String] }) requirements!: string[];
  @ApiProperty({ enum: CaseStage, isArray: true }) stages!: CaseStage[];
  @ApiProperty() turnaround!: string;
  @ApiProperty() fee!: string;
  @ApiProperty() active!: boolean;
}
