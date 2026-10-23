import { Global, Injectable, Module } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

/** Counters for the human-readable numbers. Each holds the last number issued. */
export type CounterKey = "case" | "client" | "ticket" | "report" | "filing";

/**
 * Issues sequence numbers (PRJ-118, CASE-2026-0054, TKT-1004, RPT-202, FIL-9).
 *
 * The increment is one `UPDATE ... RETURNING` run inside the caller's transaction. Postgres takes a row lock for the
 * UPDATE, so two requests can never read the same value, and the number is only consumed if the caller's transaction
 * commits (a rolled-back request hands its number back, so there are no gaps from failures).
 * The lock is held until the caller commits: keep the transaction short, and always take counters in the same order.
 */
@Injectable()
export class CounterService {
  async next(key: CounterKey, tx: Prisma.TransactionClient): Promise<number> {
    const bump = (): Promise<Array<{ value: number }>> =>
      tx.$queryRaw<Array<{ value: number }>>`UPDATE "Counter" SET value = value + 1, "updatedAt" = now() WHERE key = ${key} RETURNING value`;

    let rows = await bump();
    if (rows.length === 0) {
      // First use of this counter on a fresh database. DO NOTHING keeps a concurrent creator's row intact.
      await tx.$executeRaw`INSERT INTO "Counter" (key, value, "updatedAt") VALUES (${key}, 0, now()) ON CONFLICT (key) DO NOTHING`;
      rows = await bump();
    }
    const value = rows[0]?.value;
    if (value === undefined) throw new Error(`Counter "${key}" could not be incremented.`);
    return Number(value);
  }
}

export const formatCaseDisplay = (number: number): string => `PRJ-${number}`;

/** The client's own case ID, such as CASE-2026-0054. */
export const formatClientCaseNumber = (prefix: string, year: number, number: number): string =>
  `${prefix}-${year}-${String(number).padStart(4, "0")}`;

@Global()
@Module({ providers: [CounterService], exports: [CounterService] })
export class CounterModule {}
