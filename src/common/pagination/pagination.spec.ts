import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { ValidationFailedException } from "../exceptions";
import { flattenValidationErrors } from "../pipes/validation.pipe";
import { parseSort, windowOf } from "./paginate";
import { PaginationQueryDto } from "./pagination.dto";

async function check(query: Record<string, string>) {
  const dto = plainToInstance(PaginationQueryDto, query);
  return { dto, errors: flattenValidationErrors(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })) };
}

describe("pagination query", () => {
  it("defaults to page 1 with 20 per page", async () => {
    const { dto, errors } = await check({});
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ page: 1, limit: 20 });
  });

  it("accepts the boundaries", async () => {
    expect((await check({ page: "1", limit: "1" })).errors).toEqual([]);
    expect((await check({ page: "999", limit: "100" })).errors).toEqual([]);
  });

  it.each([
    [{ page: "0" }, "page", "page must be 1 or greater."],
    [{ page: "-3" }, "page", "page must be 1 or greater."],
    [{ page: "abc" }, "page", "page must be a whole number, 1 or greater."],
    [{ page: "1.5" }, "page", "page must be a whole number, 1 or greater."],
    [{ limit: "0" }, "limit", "limit must be 1 or greater."],
    [{ limit: "101" }, "limit", "limit can't be more than 100. Ask for a smaller page."],
    [{ limit: "500" }, "limit", "limit can't be more than 100. Ask for a smaller page."],
    [{ order: "sideways" }, "order", 'order must be "asc" or "desc".'],
    [{ sort: "name; drop" }, "sort", "sort must be a field name."],
  ])("rejects %j with a message on the field instead of clamping", async (query, field, message) => {
    const { errors } = await check(query);
    expect(errors).toContainEqual({ field, message });
  });

  it("computes the page window", () => {
    expect(windowOf({ page: 3, limit: 25 })).toEqual({ skip: 50, take: 25 });
  });

  describe("parseSort", () => {
    const allowed = ["name", "createdAt"] as const;
    it("falls back to the default only when no sort was asked for", () => {
      expect(parseSort({}, allowed, { field: "createdAt", order: "desc" })).toEqual({ field: "createdAt", order: "desc" });
      expect(parseSort({ sort: "name", order: "asc" }, allowed, { field: "createdAt", order: "desc" })).toEqual({ field: "name", order: "asc" });
    });
    it("rejects a field that isn't sortable and lists the ones that are", () => {
      expect.assertions(2);
      try {
        parseSort({ sort: "passwordHash" }, allowed, { field: "createdAt", order: "desc" });
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationFailedException);
        expect((error as ValidationFailedException).getResponse()).toMatchObject({ errors: [{ field: "sort", message: "You can sort by name, createdAt." }] });
      }
    });
  });
});
