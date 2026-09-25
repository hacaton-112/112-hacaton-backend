import chalk from "chalk";
import * as path from "path";
import { serializeError } from "serialize-error";
import * as winston from "winston";
import "winston-daily-rotate-file";

import { IS_DEV_ENV } from "./app.config";

// ── Paths ────────────────────────────────────────────────────

const LOG_DIR = path.join(process.cwd(), "logs");
const AUDIT_DIR = path.join(LOG_DIR, "audit");

// ── Custom Log Levels ────────────────────────────────────────

const LOG_LEVELS: Record<string, number> = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  verbose: 4,
  debug: 5,
};

// ── Helpers ──────────────────────────────────────────────────

function formatTimestamp(): string {
  return new Date().toLocaleString("ru-RU");
}

function formatContext(context: unknown): string {
  if (typeof context === "string") return context;
  if (context && typeof context === "object") {
    const ctx = context as Record<string, unknown>;
    const className = typeof ctx.className === "string" ? ctx.className : "";
    const handlerName =
      typeof ctx.handlerName === "string" ? ctx.handlerName : "";
    if (className || handlerName) {
      return [className, handlerName].filter(Boolean).join(".");
    }
  }
  return "Application";
}

function isEmptyStack(stack: unknown): boolean {
  if (stack == null) return true;
  if (Array.isArray(stack))
    return stack.length === 0 || stack.every((item) => item == null);
  if (typeof stack === "object") return Object.keys(stack).length === 0;
  return false;
}

// ── Delta Timing (dev only) ──────────────────────────────────

const TIMED_CONTEXTS = new Set([
  "InstanceLoader",
  "RouterExplorer",
  "RoutesResolver",
  "NestApplication",
]);

const lastTimestamps = new Map<string, number>();

const deltaFormat = winston.format(
  (info: winston.Logform.TransformableInfo) => {
    const { context } = info;

    if (typeof context === "string" && TIMED_CONTEXTS.has(context)) {
      const now = Date.now();
      const last = lastTimestamps.get(context);

      if (last) {
        const delta = now - last;
        info.message += chalk.rgb(255, 158, 59)(` +${delta}ms`);
      }

      lastTimestamps.set(context, now);
    }

    return info;
  },
);

// ── Level Colorization ───────────────────────────────────────

interface LevelStyle {
  label: string;
  colorize: (text: string) => string;
}

const LEVEL_STYLES: Record<string, LevelStyle> = {
  fatal: { label: "FATAL", colorize: chalk.red.bold },
  error: { label: "ERROR", colorize: chalk.red },
  warn: { label: "WARN", colorize: chalk.yellow },
  info: { label: "LOG", colorize: chalk.green },
  debug: { label: "DEBUG", colorize: chalk.magenta },
  verbose: { label: "VERBOSE", colorize: chalk.white },
};

// ── Formats ──────────────────────────────────────────────────

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: formatTimestamp }),
  winston.format.errors({ stack: true }),
  winston.format((info: winston.Logform.TransformableInfo) => {
    if (info.stack && typeof info.stack !== "string") {
      info.stack = serializeError(info.stack as Error);
    }
    return info;
  })(),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  deltaFormat(),
  winston.format.timestamp({ format: formatTimestamp }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info: winston.Logform.TransformableInfo) => {
    const { context, message, level, timestamp, stack, ...metadata } = info;

    const style = LEVEL_STYLES[level] ?? {
      label: level.toUpperCase(),
      colorize: (t: string) => t,
    };

    const app = chalk.green("[Nest]");
    const pid = chalk.green(`${process.pid}`);
    const ctx = chalk.rgb(255, 158, 59)(`[${formatContext(context)}]`);
    const lvl = style.colorize(style.label);
    const msg = style.colorize(String(message));

    let stackStr = "";
    if (!isEmptyStack(stack)) {
      if (typeof stack === "string") {
        stackStr = ` | ${chalk.cyan(stack)}`;
      } else {
        try {
          const serialized = serializeError(stack as Error);
          const json = JSON.stringify(serialized);
          if (json !== "{}" && json !== "null") {
            stackStr = ` | ${chalk.cyan(json)}`;
          }
        } catch {
          stackStr = ` | ${chalk.cyan(String(stack))}`;
        }
      }
    }

    // Filter out null/undefined values from metadata to avoid noise like [null]
    const cleanMeta = Object.fromEntries(
      Object.entries(metadata).filter(
        ([, v]) =>
          v != null && v !== "" && !(Array.isArray(v) && v.length === 0),
      ),
    );

    const metaStr =
      Object.keys(cleanMeta).length > 0
        ? ` | ${JSON.stringify(cleanMeta)}`
        : "";

    return `${app} ${pid}  - ${String(timestamp)}     ${lvl} ${ctx} ${msg}${stackStr}${metaStr}`;
  }),
);

// ── Transports ───────────────────────────────────────────────

const transports: winston.transport[] = [
  // Error logs — separate file for quick access
  new winston.transports.DailyRotateFile({
    level: "error",
    dirname: LOG_DIR,
    filename: "error-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "30d",
    auditFile: path.join(AUDIT_DIR, "error-auditon"),
    format: fileFormat,
  }),

  // Warn-only logs
  new winston.transports.DailyRotateFile({
    level: "warn",
    dirname: LOG_DIR,
    filename: "warn-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "30d",
    auditFile: path.join(AUDIT_DIR, "warn-auditon"),
    format: winston.format.combine(
      winston.format((info: winston.Logform.TransformableInfo) => {
        return info.level === "warn" ? info : false;
      })(),
      fileFormat,
    ),
  }),

  // Combined logs — all levels
  new winston.transports.DailyRotateFile({
    level: IS_DEV_ENV ? "debug" : "info",
    dirname: LOG_DIR,
    filename: "combined-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "30d",
    auditFile: path.join(AUDIT_DIR, "combined-auditon"),
    format: fileFormat,
  }),

  // Console — colored in dev, JSON in prod
  new winston.transports.Console({
    level: IS_DEV_ENV ? "debug" : "warn",
    format: IS_DEV_ENV ? consoleFormat : fileFormat,
  }),
];

// ── Logger Instance ──────────────────────────────────────────

const logger = winston.createLogger({
  level: IS_DEV_ENV ? "debug" : "warn",
  levels: LOG_LEVELS,
  transports,
});

export default logger;
