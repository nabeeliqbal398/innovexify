import { VersioningType, type INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { createValidationPipe } from "./common/pipes/validation.pipe";
import type { Env } from "./config/env";

/** Everything main.ts and the e2e tests share, so tests exercise the real HTTP setup. */
export function configureApp(app: INestApplication, env: Env): void {
  const express = app as NestExpressApplication;
  if (env.TRUST_PROXY) express.set("trust proxy", true);
  // JSON bodies are small except a company logo sent as a data URL (200 KB of image is about 270 KB of base64).
  express.useBodyParser("json", { limit: "400kb" });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalPipes(createValidationPipe());
  // Lets PrismaService.onModuleDestroy run on SIGTERM/SIGINT so connections close cleanly.
  app.enableShutdownHooks();
}
