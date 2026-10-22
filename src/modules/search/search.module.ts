import { Module } from "@nestjs/common";

import { SearchController } from "./controller/search.controller";
import { SearchRepository } from "./repository/search.repository";
import { SearchService } from "./service/search.service";

/** Global search, scoped like the list endpoints. */
@Module({ controllers: [SearchController], providers: [SearchRepository, SearchService] })
export class SearchModule {}
