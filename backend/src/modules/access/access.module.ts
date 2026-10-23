import { Module } from "@nestjs/common";

import { AccessController } from "./controller/access.controller";

/** Read-only view of the permission table. */
@Module({ controllers: [AccessController] })
export class AccessMatrixModule {}
