import * as dotenv from "dotenv";

dotenv.config();

/**
 * Standalone config service for use OUTSIDE of NestJS DI context.
 * Used by: auth.ts, drizzle.client.ts (which initialize before NestJS boots).
 * For code inside NestJS modules, use @nestjs/config ConfigService instead.
 */
class ConfigService {
  getOrThrow<T>(key: string): T {
    const value = process.env[key];
    if (value === undefined || value === "") {
      throw new Error(`Config error - missing environment variable: ${key}`);
    }
    return value as unknown as T;
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = process.env[key];
    if (value === undefined || value === "") {
      return defaultValue;
    }
    return value as unknown as T;
  }
}

export const configService = new ConfigService();
