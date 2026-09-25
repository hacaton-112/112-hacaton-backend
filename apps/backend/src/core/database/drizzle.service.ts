import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { type Database, db, pool } from "./drizzle.client";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2_000;

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DrizzleService.name);
  private isShuttingDown = false;

  get db(): Database {
    return db;
  }

  get isAvailable(): boolean {
    return !this.isShuttingDown;
  }

  async onModuleInit(): Promise<void> {
    await this.connectWithRetry();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    await pool.end();
    this.logger.log("Database disconnected");
  }

  private async connectWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const client = await pool.connect();
        client.release();
        this.logger.log("Database connected");
        return;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";

        if (attempt === MAX_RETRIES) {
          const stack = error instanceof Error ? error.stack : undefined;
          this.logger.error(
            `Database connection failed after ${MAX_RETRIES} attempts: ${message}`,
            stack,
          );
          throw error;
        }

        this.logger.warn(
          `Database connection attempt ${attempt}/${MAX_RETRIES} failed: ${message}. Retrying in ${RETRY_DELAY_MS}ms...`,
        );
        await this.delay(RETRY_DELAY_MS * attempt);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
