import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

/** Interactive API docs at /api/docs. Never mounted in production. */
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
