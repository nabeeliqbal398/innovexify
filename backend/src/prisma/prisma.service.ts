import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * The database container may still be starting when the API boots, so the first connection is retried
   * with exponential backoff (1s, 2s, 4s, 8s) before giving up with a readable message.
   */
  async onModuleInit(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.$connect();
        this.logger.log("Connected to the database.");
        return;
      } catch (error) {
        const reason = error instanceof Error ? error.message.split("\n").pop() : "unknown error";
        if (attempt === MAX_ATTEMPTS) {
          this.logger.error(
            `Could not reach the database after ${MAX_ATTEMPTS} attempts (${reason}). ` +
              "Check that Docker Desktop is running, `docker compose up -d db` has finished, and DATABASE_URL points at the right host and port.",
          );
          throw error;
        }
        const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
        this.logger.warn(`Database not ready (attempt ${attempt}/${MAX_ATTEMPTS}). Retrying in ${delay / 1000}s.`);
        await sleep(delay);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
