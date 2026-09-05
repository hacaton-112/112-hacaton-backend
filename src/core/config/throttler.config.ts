import type { ThrottlerModuleOptions } from "@nestjs/throttler";

export const throttlerConfig: ThrottlerModuleOptions = [
  {
    name: "short",
    ttl: 1000, // 1 second
    limit: 10, // 10 requests per second
  },
  {
    name: "medium",
    ttl: 10000, // 10 seconds
    limit: 50, // 50 requests per 10 seconds
  },
  {
    name: "long",
    ttl: 60000, // 1 minute
    limit: 200, // 200 requests per minute
  },
];
