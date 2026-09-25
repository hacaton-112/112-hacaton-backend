import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";

import { UsersController } from "./users.controller";
import { UsersService } from "./application/users.service";
import { AdminQueuesController } from "./admin-queues.controller";
import { AdminQueuesService } from "./application/admin-queues.service";

@Module({
  imports: [AuthModule],
  controllers: [UsersController, AdminQueuesController],
  providers: [UsersService, AdminQueuesService],
})
export class UsersModule {}
