import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";

import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { AdminQueuesController } from "./admin-queues.controller";
import { AdminQueuesService } from "./admin-queues.service";

@Module({
  imports: [AuthModule],
  controllers: [UsersController, AdminQueuesController],
  providers: [UsersService, AdminQueuesService],
})
export class UsersModule {}
