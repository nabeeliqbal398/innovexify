import { Global, Injectable, Module } from "@nestjs/common";

import { loadEnv, type Env } from "./env";

/** The validated environment, available anywhere by injection. */
@Injectable()
export class AppConfig {
  readonly env: Env = loadEnv();

  get isProduction(): boolean {
    return this.env.NODE_ENV === "production";
  }
}

@Global()
@Module({ providers: [AppConfig], exports: [AppConfig] })
export class AppConfigModule {}
