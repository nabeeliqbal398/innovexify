import { config as loadDotenv } from "dotenv";
import { expand } from "dotenv-expand";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((v) =>
      v
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  THROTTLE_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(100),
  JWT_ACCESS_SECRET: z.string({ error: "JWT_ACCESS_SECRET is not set." }).min(32, "JWT_ACCESS_SECRET must be at least 32 characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  INVITATION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(240).default(15),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Refresh tokens travel in an httpOnly cookie. Only when this is true are they also accepted and returned in JSON bodies. */
  ALLOW_BODY_REFRESH: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** SameSite attribute of the refresh cookie. "none" is only accepted when the cookie is also Secure (see the check below). */
  REFRESH_COOKIE_SAMESITE: z
    .enum(["strict", "lax", "none"], { error: "REFRESH_COOKIE_SAMESITE must be strict, lax or none." })
    .default("strict"),
  /** Force the Secure flag outside production (production is always Secure). Needed for SameSite=none behind HTTPS. */
  REFRESH_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Trust X-Forwarded-For (set to true only behind a reverse proxy you control). */
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Where uploaded files live. Never inside a public or served directory; created at startup. Relative paths resolve from the working directory. */
  STORAGE_DIR: z.string().trim().min(1).default("./storage"),
  /** Largest accepted upload, in megabytes (25 matches the "files over 25 MB" rule in the product). */
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(25),
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is not set." })
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must start with postgresql://")
    .refine((v) => !v.includes("${"), "DATABASE_URL still contains an unexpanded ${VARIABLE}. Define POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_PORT and POSTGRES_DB in .env."),
}).superRefine((env, ctx) => {
  // Browsers drop a SameSite=None cookie that is not Secure, so refuse the combination at startup instead of
  // letting every sign-in silently lose its refresh token.
  if (env.REFRESH_COOKIE_SAMESITE === "none" && env.NODE_ENV !== "production" && !env.REFRESH_COOKIE_SECURE) {
    ctx.addIssue({
      code: "custom",
      path: ["REFRESH_COOKIE_SAMESITE"],
      message: 'REFRESH_COOKIE_SAMESITE=none needs a Secure cookie. Run in production, or set REFRESH_COOKIE_SECURE=true (HTTPS only), or use strict or lax.',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Read and validate the environment once, at startup. Variables in .env may reference each other
 * (DATABASE_URL is built from the POSTGRES_* values). Fails fast with a readable list of problems.
 */
export function loadEnv(): Env {
  expand(loadDotenv({ quiet: true }));
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nCopy .env.example to .env and fill it in.`);
  }
  return parsed.data;
}
