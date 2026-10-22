import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);
const lower = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim().toLowerCase() : value);

/** Same rules the sign-up form shows: 12+ characters, upper and lower case, and a number. */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,128}$/;
export const PASSWORD_MESSAGE = "Use 12 to 128 characters with upper and lower case letters and at least one number.";

export class LoginDto {
  @ApiProperty({ example: "sarah.bennett@example.com" })
  @Transform(lower)
  @IsEmail({}, { message: "Enter a valid email address." })
  @MaxLength(254, { message: "That email address is too long." })
  email!: string;

  @ApiProperty({ example: "••••••••••••" })
  @IsString({ message: "Enter your password." })
  @IsNotEmpty({ message: "Enter your password." })
  @MaxLength(128, { message: "That password is too long." })
  password!: string;
}

export class RefreshDto {
  @ApiPropertyOptional({ description: "Only read when ALLOW_BODY_REFRESH=true. Normally the httpOnly cookie is used." })
  @IsOptional()
  @IsString({ message: "The refresh token is required." })
  @MinLength(32, { message: "The refresh token isn't valid." })
  @MaxLength(256, { message: "The refresh token isn't valid." })
  refreshToken?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString({ message: "Enter your current password." })
  @IsNotEmpty({ message: "Enter your current password." })
  @MaxLength(128, { message: "That password is too long." })
  currentPassword!: string;

  @ApiProperty({ example: "Correct-Horse-9Battery" })
  @IsString({ message: "Choose a new password." })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: "The token from the invitation link." })
  @Transform(trim)
  @IsString({ message: "The invitation token is required." })
  @MinLength(32, { message: "This invitation link isn't valid." })
  @MaxLength(256, { message: "This invitation link isn't valid." })
  token!: string;

  @ApiProperty({ example: "Correct-Horse-9Battery" })
  @IsString({ message: "Choose a password." })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password!: string;
}

export class InvitationLookupDto {
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ["ADMIN", "MANAGER", "CSR", "COMPLIANCE", "CLIENT"] }) role!: string;
  @ApiProperty({ nullable: true }) caseNumber!: string | null;
  @ApiProperty({ nullable: true }) invitedBy!: string | null;
  @ApiProperty() expiresAt!: Date;
}

export class SessionUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ["ADMIN", "MANAGER", "CSR", "COMPLIANCE", "CLIENT"] }) role!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true, type: Object }) clientProfile!: { caseNumber: string; csrId: string | null; businessName: string; formationState: string } | null;
}

export class AuthSessionDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ description: "Seconds until the access token expires." }) expiresIn!: number;
  @ApiPropertyOptional({ description: "Present only when ALLOW_BODY_REFRESH=true; otherwise the refresh token is an httpOnly cookie." })
  refreshToken?: string;
  @ApiProperty({ type: SessionUserDto }) user!: SessionUserDto;
}
