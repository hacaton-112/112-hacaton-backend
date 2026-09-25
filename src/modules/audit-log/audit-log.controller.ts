import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { AuditLogQueryService } from "./application/audit-log-query.service";
import {
  type AuditLogPage,
  AuditLogPageDto,
  AuditLogQueryDto,
} from "./dto/audit-log.dto";

@Controller(ApiRoutes.AuditLog)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AuditLogController {
  constructor(private readonly queryService: AuditLogQueryService) {}

  @Get()
  @ZodSerializerDto(AuditLogPageDto)
  search(@Query() query: AuditLogQueryDto): Promise<AuditLogPage> {
    return this.queryService.search(query);
  }
}
