import { ApiProperty } from "@nestjs/swagger";

export class AccessRowDto {
  @ApiProperty() label!: string;
  @ApiProperty() permission!: string;
  @ApiProperty({ type: [String], description: "The roles that have this capability." }) roles!: string[];
}
