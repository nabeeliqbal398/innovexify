import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Role, UserStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);

/** The text field of a message. An attachment, if any, travels in the multipart field named `file`. */
export class SendMessageDto {
  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @Transform(trim)
  @IsString({ message: "Write a message first." })
  @IsNotEmpty({ message: "Write a message first." })
  @MaxLength(5000, { message: "A message can't be longer than 5000 characters." })
  text!: string;
}

export class MessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() clientId!: string;
  @ApiProperty() text!: string;
  @ApiProperty() sender!: { id: string; name: string; role: Role };
  @ApiProperty({ description: "True when you wrote it." }) mine!: boolean;
  @ApiProperty({ nullable: true }) attachment!: { name: string; mimeType: string | null; sizeBytes: number | null } | null;
  @ApiProperty() createdAt!: Date;
}

export class ConversationDto {
  @ApiProperty() client!: { id: string; name: string; status: UserStatus; caseNumber: string; businessName: string };
  @ApiProperty({ nullable: true }) lastMessage!: {
    id: string;
    text: string;
    sender: { id: string; name: string };
    hasAttachment: boolean;
    createdAt: Date;
  } | null;
  @ApiProperty({ description: "Messages from other people after your read marker." }) unread!: number;
  @ApiPropertyOptional({ description: "False when the account is suspended or removed: the thread can be read but not written to." }) writable!: boolean;
}

export class ReadResultDto {
  @ApiProperty() unread!: number;
  @ApiProperty({ nullable: true }) readUpTo!: Date | null;
}
