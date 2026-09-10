import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";

import { IncidentCardService } from "./application/incident-card.service";
import {
  type IncidentCard,
  IncidentCardDto,
  SaveIncidentCardDto,
} from "./dto/incident-card.dto";

/**
 * Карточка происшествия одного учебного звонка.
 *
 * Адресуется идентификатором звонка: карточка без звонка не существует, а
 * учебная сессия — это и есть один звонок.
 */
@Controller(`${ApiRoutes.Calls}/:trainingSessionId/incident-card`)
@UseGuards(JwtAuthGuard)
export class IncidentCardController {
  constructor(private readonly cards: IncidentCardService) {}

  @Get()
  @ZodSerializerDto(IncidentCardDto)
  get(
    @Param("trainingSessionId") trainingSessionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<IncidentCard> {
    return this.cards.get(trainingSessionId, request.user.sub);
  }

  /**
   * Сохранение целиком, а не по полю: окно отдаёт карточку так, как она
   * выглядит сейчас, и порядок пострадавших в ней — часть содержимого.
   */
  @Put()
  @ZodSerializerDto(IncidentCardDto)
  save(
    @Param("trainingSessionId") trainingSessionId: string,
    @Body() body: SaveIncidentCardDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<IncidentCard> {
    return this.cards.save(trainingSessionId, request.user.sub, body);
  }
}
