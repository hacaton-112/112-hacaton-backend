import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { DdsArchiveService } from "./application/dds-archive.service";
import {
  type DdsArchivePage,
  DdsArchivePageDto,
  type DdsArchiveQuery,
  DdsArchiveQueryDto,
} from "./dto/dds-archive.dto";

@Controller("dds/archive")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("operator", "instructor", "admin")
export class DdsArchiveController {
  constructor(private readonly archive: DdsArchiveService) {}

  @Get()
  @ZodSerializerDto(DdsArchivePageDto)
  search(
    @Query() query: DdsArchiveQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DdsArchivePage> {
    return this.archive.search(
      { id: request.user.sub, role: request.user.role },
      query as DdsArchiveQuery,
    );
  }
}
