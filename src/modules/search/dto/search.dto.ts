import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

const trim = ({ value }: { value: unknown }): unknown => (typeof value === "string" ? value.trim() : value);

export class SearchQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 100, description: "What to look for (matched anywhere in names, IDs, titles and message text, ignoring case)." })
  @Transform(trim)
  @IsString({ message: "q must be the text to search for." })
  @MinLength(2, { message: "Type at least 2 characters to search." })
  @MaxLength(100, { message: "Search text can't be longer than 100 characters." })
  q!: string;
}

/** Where a result leads: a screen name, and the record or query the screen opens with. The same names the navigation uses. */
export interface SearchTarget {
  view: string;
  id?: string;
  query?: Record<string, string>;
}

export interface SearchItem {
  title: string;
  meta: string;
  target: SearchTarget;
}

export interface SearchGroup {
  key: string;
  label: string;
  items: SearchItem[];
}

export interface SearchResult {
  query: string;
  groups: SearchGroup[];
}
