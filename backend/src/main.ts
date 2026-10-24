import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";
import { AppConfig } from "./config/app-config";
import { setupDocs } from "./config/swagger";

async function bootstrap(): Promise<void> {
  // AppConfig validates the environment when it is created, so mistakes fail fast with a clear message.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const { env, isProduction } = app.get(AppConfig);
  const logger = app.get(Logger);
  app.useLogger(logger);

  configureApp(app, env);

  setupDocs(app, env);

  await app.listen(env.PORT);
  logger.log(`API listening on port ${env.PORT}${isProduction ? "" : " (docs at /api/docs)"}`);
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
