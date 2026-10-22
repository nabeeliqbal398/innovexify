import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

import { CursorQueryDto } from "../../../common/pagination/cursor.dto";

const toBoolean = ({ value }: { value: unknown }): unknown => (value === "true" ? true : value === "false" ? false : value);

export class ListNotificationsQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ description: "true: only the ones you haven't read." })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: "unread must be true or false." })
  unread?: boolean;
}

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ description: 'The name of the view it opens (never a URL), or "" for none.' }) link!: string;
  @ApiProperty() read!: boolean;
  @ApiProperty({ nullable: true }) readAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}
