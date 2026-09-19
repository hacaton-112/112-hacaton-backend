import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { AppBadRequestException } from "@/common/exceptions/app.exception";
import { ApiRoutes, ErrorCodes } from "@/contracts";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import {
  BindWorkstationRequestDto,
  ExtensionSchema,
  RescueCrewListDto,
  TelephonyWorkstationListDto,
} from "./dto/telephony.dto";
import { DrizzleTelephonyDirectory } from "./infrastructure/drizzle-telephony.directory";

const extension = (value: string): string => {
  if (!ExtensionSchema.safeParse(value).success) {
    throw new AppBadRequestException(
      ErrorCodes.VALIDATION_FAILED,
      "A workstation extension is two to six digits",
    );
  }

  return value;
};

/**
 * Справочники учебной АТС.
 *
 * Наряды видит преподаватель, а рассаживает людей за телефоны администратор:
 * от этой привязки зависит, к чьей карточке отнесётся звонок наряду.
 */
@Controller(ApiRoutes.Telephony)
@UseGuards(JwtAuthGuard, RolesGuard)
export class TelephonyController {
  constructor(private readonly directory: DrizzleTelephonyDirectory) {}

  @Get("crews")
  @Roles("instructor", "admin")
  @ZodSerializerDto(RescueCrewListDto)
  async crews() {
    return { crews: await this.directory.listCrews() };
  }

  @Get("workstations")
  @Roles("admin")
  @ZodSerializerDto(TelephonyWorkstationListDto)
  async workstations() {
    return { workstations: await this.directory.listWorkstations() };
  }

  @Put("workstations/:extension")
  @Roles("admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async bind(
    @Param("extension") value: string,
    @Body() body: BindWorkstationRequestDto,
  ): Promise<void> {
    await this.directory.bindWorkstation(extension(value), body.userId);
  }

  @Delete("workstations/:extension")
  @Roles("admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async unbind(@Param("extension") value: string): Promise<void> {
    await this.directory.unbindWorkstation(extension(value));
  }
}
