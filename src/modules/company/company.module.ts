import { Module } from "@nestjs/common";

import { CompanyController } from "./controller/company.controller";
import { CompanyRepository } from "./repository/company.repository";
import { CompanyService } from "./service/company.service";

/** Company name, logo and case prefix. */
@Module({ controllers: [CompanyController], providers: [CompanyRepository, CompanyService] })
export class CompanyModule {}
