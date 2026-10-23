import "reflect-metadata";

import { PrismaClient, type User } from "@prisma/client";
import * as argon2 from "argon2";

import { PASSWORD_MESSAGE, PASSWORD_PATTERN } from "../modules/auth/dto/auth.dto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface CreateAdminInput {
  email: string;
  name: string;
  password: string;
}

/**
 * Creates the first Admin of a new installation, where there is no seed data to sign in with. It refuses when an Admin
 * already exists (more people are invited from the portal), when the email is taken, or when the password breaks the policy.
 * The password is hashed with Argon2id exactly as sign-in expects, and a row is written to the audit log.
 */
export async function createFirstAdmin(prisma: PrismaClient, input: CreateAdminInput): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL_PATTERN.test(email)) throw new Error("ADMIN_EMAIL must be a valid email address.");
  if (!name) throw new Error("ADMIN_NAME is required.");
  if (!PASSWORD_PATTERN.test(input.password)) throw new Error(`ADMIN_PASSWORD: ${PASSWORD_MESSAGE}`);
  if ((await prisma.user.count({ where: { role: "ADMIN", deletedAt: null } })) > 0) {
    throw new Error("An Admin already exists. Invite further staff from the portal instead.");
  }
  if (await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, status: { not: "REMOVED" } } })) {
    throw new Error(`The email ${email} is already used by another account.`);
  }
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const user = await prisma.user.create({ data: { email, name, role: "ADMIN", status: "ACTIVE", passwordHash } });
  await prisma.auditLog.create({ data: { actorId: user.id, actorRole: "ADMIN", action: "Created the first Admin account", target: email, category: "users", ok: true } });
  return user;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const user = await createFirstAdmin(prisma, {
      email: process.env.ADMIN_EMAIL ?? "",
      name: process.env.ADMIN_NAME ?? "",
      password: process.env.ADMIN_PASSWORD ?? "",
    });
    process.stdout.write(`Created the Admin ${user.email}. Sign in, then change the password from Settings if it was shared.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
