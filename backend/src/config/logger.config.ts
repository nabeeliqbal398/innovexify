import { randomUUID } from "node:crypto";

import type { Params } from "nestjs-pino";

import type { Env } from "./env";

/** Fields whose values must never reach the logs. */
export const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "*.password",
  "*.currentPassword",
  "*.newPassword",
  "*.confirmPassword",
  "*.passwordHash",
  "*.token",
  "*.tokenHash",
  "*.accessToken",
  "*.refreshToken",
];

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

export function buildLoggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      // Each request is logged once by LoggingInterceptor, so the built-in access log stays off.
      autoLogging: false,
      redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      ...(env.NODE_ENV === "production"
        ? {}
        : { transport: { target: "pino-pretty", options: { singleLine: true, colorize: true, translateTime: "SYS:HH:MM:ss" } } }),
    },
  };
}
