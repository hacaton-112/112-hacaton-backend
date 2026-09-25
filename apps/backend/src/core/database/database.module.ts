import { Global, Module } from "@nestjs/common";

import { DrizzleService } from "./drizzle.service";
import { DRIZZLE } from "./drizzle.token";

@Global()
@Module({
  providers: [
    DrizzleService,
    {
      provide: DRIZZLE,
      useFactory: (drizzleService: DrizzleService) => drizzleService.db,
      inject: [DrizzleService],
    },
  ],
  exports: [DRIZZLE, DrizzleService],
})
export class DatabaseModule {}
