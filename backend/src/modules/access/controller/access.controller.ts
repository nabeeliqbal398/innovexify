import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";

import { ACCESS_MATRIX, PERMS, type Permission } from "../../../common/permissions/permissions";
import type { AccessRowDto } from "../dto/access.dto";

const ROLES = ["ADMIN", "MANAGER", "CSR", "COMPLIANCE", "CLIENT"] as const;

/** The access matrix shown to staff, generated from the same permission table the server enforces, so the two can't drift. */
@ApiTags("access")
@ApiBearerAuth()
@Controller("access")
export class AccessController {
  @Get("matrix")
  @ApiOperation({ summary: "The 18 capabilities and which roles have each" })
  matrix(): { roles: readonly string[]; rows: AccessRowDto[] } {
    return {
      roles: ROLES,
      rows: ACCESS_MATRIX.map(([label, permission]: readonly [string, Permission]) => ({
        label,
        permission,
        roles: ROLES.filter((role) => PERMS[permission].includes(role)),
      })),
    };
  }
}
