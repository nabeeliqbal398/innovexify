import { describe, expect, it } from "vitest";

import { ACCESS_MATRIX as FRONT_MATRIX, PERMS as FRONT_PERMS, REASON as FRONT_REASON } from "@/lib/permissions";
// The backend's table is plain TypeScript with a type-only import, so the test reads the real file rather than a copy.
import { ACCESS_MATRIX as BACK_MATRIX, PERMS as BACK_PERMS, REASON as BACK_REASON } from "../../../backend/src/common/permissions/permissions";

const sorted = (roles: readonly string[]): string[] => [...roles].sort();

describe("the frontend permission table matches the backend's", () => {
  it("has the same permissions", () => {
    expect(Object.keys(FRONT_PERMS).sort()).toEqual(Object.keys(BACK_PERMS).sort());
  });

  it.each(Object.keys(BACK_PERMS))("grants %s to the same roles", (permission) => {
    expect(sorted(FRONT_PERMS[permission as keyof typeof FRONT_PERMS])).toEqual(sorted(BACK_PERMS[permission as keyof typeof BACK_PERMS]));
  });

  it("shows the same capabilities, in the same order, in the access matrix", () => {
    expect(FRONT_MATRIX.map(([label, permission]) => [label, permission])).toEqual(BACK_MATRIX.map(([label, permission]) => [label, permission]));
  });

  it("explains a refusal in the same words", () => {
    const keys = Object.keys(BACK_REASON).sort();
    expect(Object.keys(FRONT_REASON).sort()).toEqual(keys);
    for (const key of keys) expect(FRONT_REASON[key as keyof typeof FRONT_REASON], key).toBe(BACK_REASON[key as keyof typeof BACK_REASON]);
  });
});
