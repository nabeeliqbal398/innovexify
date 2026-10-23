import { ValidationFailedException } from "../exceptions";
import { PaginatedResponse } from "../responses/api-response";
import type { PaginationQueryDto } from "./pagination.dto";

export interface PageWindow {
  skip: number;
  take: number;
}

export const windowOf = (query: Pick<PaginationQueryDto, "page" | "limit">): PageWindow => ({ skip: (query.page - 1) * query.limit, take: query.limit });

/**
 * Runs one page query and wraps it as a PaginatedResponse (the meta block is built from the query, so every list
 * endpoint reports page, limit, total and totalPages the same way). `load` returns the page rows and the total count.
 */
export async function paginate<Row, Item = Row>(
  query: Pick<PaginationQueryDto, "page" | "limit">,
  load: (window: PageWindow) => Promise<[Row[], number]>,
  toItem?: (row: Row) => Item,
): Promise<PaginatedResponse<Item>> {
  const [rows, total] = await load(windowOf(query));
  const items = toItem ? rows.map(toItem) : (rows as unknown as Item[]);
  return new PaginatedResponse(items, total, query.page, query.limit);
}

/**
 * Validates `sort` against the fields an endpoint supports and returns the field and direction to use.
 * An unknown field is a field-level error that lists the allowed ones, not a silent fallback.
 */
export function parseSort<Field extends string>(
  query: Pick<PaginationQueryDto, "sort" | "order">,
  allowed: readonly Field[],
  fallback: { field: Field; order: "asc" | "desc" },
): { field: Field; order: "asc" | "desc" } {
  if (query.sort === undefined) return { field: fallback.field, order: query.order ?? fallback.order };
  // The default direction (newest first, say) belongs to the default sort. Naming a field alone means ascending.
  if (!(allowed as readonly string[]).includes(query.sort)) {
    throw new ValidationFailedException([{ field: "sort", message: `You can sort by ${allowed.join(", ")}.` }]);
  }
  return { field: query.sort as Field, order: query.order ?? "asc" };
}
