import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import type { Env } from "./env";

/** The interactive docs (/api/docs) and the machine-readable spec (/api/docs-json, -yaml) exist everywhere except production. */
export function setupDocs(app: INestApplication, env: Pick<Env, "NODE_ENV">): boolean {
  if (env.NODE_ENV === "production") return false;
  setupSwagger(app);
  return true;
}

/** Mounts the docs unconditionally: call setupDocs, which refuses in production. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Innovexify CRM API")
    .setDescription(
      "Every success returns { success, statusCode, message, data, meta?, timestamp, path }. Every error returns { success: false, statusCode, errorCode, message, errors?, timestamp, path }.",
    )
    .setVersion("1")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config), {
    swaggerOptions: { persistAuthorization: true },
  });
}
