import { Controller, Get, UseGuards } from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { AdminQueuesService } from "./application/admin-queues.service";
import { AdminQueuesDto } from "./dto/admin-queues.dto";

@Controller("admin/queues")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminQueuesController {
  constructor(private readonly queues: AdminQueuesService) {}

  @Get()
  @ZodSerializerDto(AdminQueuesDto)
  get() {
    return this.queues.get();
  }
}
