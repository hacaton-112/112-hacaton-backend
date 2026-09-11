import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";

import { DebriefService } from "./application/debrief.service";
import {
  type CallList,
  CallListDto,
  type Debrief,
  DebriefDto,
} from "./dto/debrief.dto";

/** Закончившийся звонок: список своих и разбор одного. */
@Controller(ApiRoutes.Calls)
@UseGuards(JwtAuthGuard)
export class DebriefController {
  constructor(private readonly debrief: DebriefService) {}

  @Get()
  @ZodSerializerDto(CallListDto)
  async list(@Req() request: AuthenticatedRequest): Promise<CallList> {
    return { calls: [...(await this.debrief.listCalls(request.user.sub))] };
  }

  @Get(":trainingSessionId/debrief")
  @ZodSerializerDto(DebriefDto)
  get(
    @Param("trainingSessionId") trainingSessionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<Debrief> {
    return this.debrief.get(trainingSessionId, request.user.sub);
  }

  /**
   * Кусок записи проигрывается через backend, а не по ссылке в хранилище:
   * корзина остаётся закрытой, а клиенту не нужны ключи от неё.
   */
  @Get(":trainingSessionId/recording/:index")
  @Header("Content-Type", "audio/wav")
  @Header("Cache-Control", "private, max-age=3600")
  async recording(
    @Param("trainingSessionId") trainingSessionId: string,
    @Param("index", ParseIntPipe) index: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const audio = await this.debrief.readSegment(
      trainingSessionId,
      request.user.sub,
      index,
    );

    return new StreamableFile(Buffer.from(audio));
  }
}
