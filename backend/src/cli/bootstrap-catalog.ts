import "reflect-metadata";

import { PrismaClient } from "@prisma/client";

import { DEFAULT_SERVICES, type CatalogService } from "./service-catalog";

export interface CatalogOutcome {
  created: string[];
  unchanged: string[];
  /** Present, but different from the default: someone edited it. Left exactly as it is. */
  edited: string[];
}

type Stored = CatalogService & { turnaround: string; fee: string };

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

function isDefault(stored: Stored, wanted: CatalogService): boolean {
  return (
    stored.name === wanted.name &&
    stored.category === wanted.category &&
    stored.description === wanted.description &&
    stored.active === wanted.active &&
    stored.turnaround === "" &&
    stored.fee === "" &&
    sameList(stored.requirements, wanted.requirements) &&
    sameList(stored.stages, wanted.stages)
  );
}

/**
 * Adds the default service catalog to a fresh database. Safe to run again, and safe in production:
 *  - it only INSERTS; a service whose id already exists is never updated, so nothing an Admin edited (name, stages, fee, switched off) is touched;
 *  - it creates no clients, cases, tasks or documents;
 *  - the rows are inserted in one statement that skips ids that exist, so two runs at once cannot clash.
 */
export async function bootstrapCatalog(prisma: PrismaClient): Promise<CatalogOutcome> {
  const existing = new Map((await prisma.service.findMany({ where: { id: { in: DEFAULT_SERVICES.map((s) => s.id) } } })).map((s) => [s.id, s as Stored]));
  const outcome: CatalogOutcome = { created: [], unchanged: [], edited: [] };
  const missing: CatalogService[] = [];
  for (const wanted of DEFAULT_SERVICES) {
    const stored = existing.get(wanted.id);
    if (!stored) missing.push(wanted);
    else if (isDefault(stored, wanted)) outcome.unchanged.push(wanted.id);
    else outcome.edited.push(wanted.id);
  }
  if (missing.length > 0) {
    await prisma.service.createMany({ data: missing, skipDuplicates: true });
    outcome.created = missing.map((s) => s.id);
  }
  return outcome;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const { created, unchanged, edited } = await bootstrapCatalog(prisma);
    process.stdout.write(`Service catalog: ${created.length} added, ${unchanged.length} already there, ${edited.length} edited and left alone.\n`);
    if (created.length) process.stdout.write(`  added: ${created.join(", ")}\n`);
    if (edited.length) process.stdout.write(`  left as edited: ${edited.join(", ")}\n`);
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
