import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);

export class UpdateTriggerDto {
  @ApiPropertyOptional({ description: "Switch the email on or off (Admin, Manager). In-app notifications are not affected." })
  @IsOptional()
  @IsBoolean({ message: "enabled must be true or false." })
  enabled?: boolean;

  @ApiPropertyOptional({ description: "The email template to use; one of the trigger's templateOptions (Admin only)." })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: "template must be text." })
  @MaxLength(80, { message: "template is too long." })
  template?: string;
}

export class TriggerDto {
  @ApiProperty({ example: "inv" }) key!: string;
  @ApiProperty() name!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() template!: string;
  @ApiProperty({ type: [String] }) templateOptions!: string[];
  @ApiProperty({ description: "Security events can't be switched off." }) security!: boolean;
}
