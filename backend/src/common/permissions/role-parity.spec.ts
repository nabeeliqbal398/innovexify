import { Role as PrismaRole } from "@prisma/client";

import { roleParity } from "./role-parity";

describe("permission table Role type", () => {
  it("is exactly the Role enum in schema.prisma (the compile-time check lives in role-parity.ts)", () => {
    expect(roleParity).toEqual({ prismaRolesAllKnownHere: true, localRolesAllInPrisma: true });
    expect(Object.values(PrismaRole).sort()).toEqual(["ADMIN", "CLIENT", "COMPLIANCE", "CSR", "MANAGER"]);
  });
});
