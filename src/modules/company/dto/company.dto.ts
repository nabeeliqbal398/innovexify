import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);
const upper = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim().toUpperCase() : value);

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: "Innovexify", description: "Admin only." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "name must be text." })
  @MinLength(1, { message: "The company name can't be empty." })
  @MaxLength(60, { message: "The company name can't be longer than 60 characters." })
  name?: string;

  @ApiPropertyOptional({ example: "CASE", description: "1 to 8 letters; used for case IDs created from now on. Admin and Manager." })
  @IsOptional()
  @Transform(upper)
  @IsString({ message: "casePrefix must be text." })
  @Matches(/^[A-Z]{1,8}$/, { message: "The case prefix must be 1 to 8 letters (A to Z), with no spaces, digits or symbols." })
  casePrefix?: string;

  @ApiPropertyOptional({ description: "A PNG or JPEG as a data URL, under 200 KB. Send an empty string to remove the logo. Admin only." })
  @IsOptional()
  @IsString({ message: "logo must be a data URL, or an empty string to remove it." })
  @MaxLength(300_000, { message: "The logo is too large. Use a PNG or JPEG under 200 KB." })
  logo?: string;
}

export class CompanyDto {
  @ApiProperty() name!: string;
  @ApiProperty() casePrefix!: string;
  @ApiProperty({ description: "A data URL, or an empty string when there is no logo." }) logo!: string;
  @ApiProperty() updatedAt!: Date;
}
