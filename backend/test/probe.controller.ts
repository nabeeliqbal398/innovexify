import { Body, Controller, Get, Param, Post } from "@nestjs/common";

import { Public, Roles } from "../src/common/decorators/auth.decorators";
import { RequirePermission } from "../src/common/permissions/require-permission.decorator";
import { PrismaService } from "../src/prisma/prisma.service";

/** Routes that exist only in tests, to exercise the permission guard and the error filter end to end. */
@Controller("probe")
export class ProbeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("remove-user")
  @RequirePermission("removeUser")
  removeUser() {
    return { allowed: true };
  }

  /** Ownership: a CSR may open only their assigned clients; a client only themselves. */
  @Get("clients/:clientId")
  @RequirePermission("viewClient", async ({ request, prisma }) => {
    const client = await prisma.user.findUnique({ where: { id: String(request.params.clientId) }, include: { clientProfile: true } });
    return client ? { id: client.id, csr: client.clientProfile?.csrId ?? null } : undefined;
  })
  viewClient(@Param("clientId") clientId: string) {
    return { clientId };
  }

  /** Creates a user straight through Prisma, so a duplicate email surfaces as a raw P2002. */
  @Post("users")
  @Roles("ADMIN")
  createUser(@Body() body: { email: string }) {
    return this.prisma.user.create({ data: { email: body.email, name: "Probe", role: "CSR" }, select: { id: true } });
  }

  /** An unexpected failure carrying details that must never reach a client. */
  @Get("explode")
  @Public()
  explode(): never {
    throw new Error("boom: password=hunter2 at /srv/app/secret.ts:42 connection string postgresql://u:p@db/x");
  }

  /** A database error whose message contains the SQL and a table name. */
  @Get("sql")
  @Public()
  sql() {
    return this.prisma.$queryRawUnsafe("SELECT secret_column FROM table_that_does_not_exist WHERE x = 1");
  }
}
