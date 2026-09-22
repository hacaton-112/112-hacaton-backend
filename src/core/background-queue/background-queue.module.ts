import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { BackgroundQueueScheduler } from "./background-queue.scheduler";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [BackgroundQueueScheduler],
  exports: [BackgroundQueueScheduler],
})
export class BackgroundQueueModule {}
