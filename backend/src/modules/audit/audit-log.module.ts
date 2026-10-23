import { Module } from "@nestjs/common";

import { AuditController } from "./controller/audit.controller";
import { AuditRepository } from "./repository/audit.repository";
import { AuditLogService } from "./service/audit-log.service";

/** Reading and exporting the audit log (writing is `common/audit/AuditService`). Read-only by design. */
@Module({
  controllers: [AuditController],
  providers: [AuditRepository, AuditLogService],
})
export class AuditLogModule {}
