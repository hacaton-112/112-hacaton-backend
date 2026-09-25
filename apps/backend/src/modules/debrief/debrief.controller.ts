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
import { TrainingService } from "@/modules/training/application/training.service";

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
  constructor(
    private readonly debrief: DebriefService,
    private readonly training: TrainingService,
  ) {}

  @Get()
  @ZodSerializerDto(CallListDto)
  async list(@Req() request: AuthenticatedRequest): Promise<CallList> {
    return { calls: [...(await this.debrief.listCalls(request.user.sub))] };
  }

  @Get(":trainingSessionId/debrief")
  @ZodSerializerDto(DebriefDto)
  async get(
    @Param("trainingSessionId") trainingSessionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<Debrief> {
    return this.debrief.get(
      trainingSessionId,
      await this.callOwner(trainingSessionId, request),
    );
  }

  /** Разговор целиком: то, что слушают на разборе первым делом. */
  @Get(":trainingSessionId/recording")
  @Header("Content-Type", "audio/wav")
  @Header("Cache-Control", "private, max-age=3600")
  async wholeRecording(
    @Param("trainingSessionId") trainingSessionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const audio = await this.debrief.readWholeRecording(
      trainingSessionId,
      await this.callOwner(trainingSessionId, request),
    );

    return new StreamableFile(Buffer.from(audio));
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
      await this.callOwner(trainingSessionId, request),
      index,
    );

    return new StreamableFile(Buffer.from(audio));
  }

  /**
   * Чей звонок открывается. Оператор видит только свои; преподаватель —
   * звонки обучающихся своих групп, чтобы разбор и запись открывались и из
   * его кабинета.
   */
  private async callOwner(
    trainingSessionId: string,
    request: AuthenticatedRequest,
  ): Promise<string> {
    if (request.user.role === "operator") return request.user.sub;
    const session = await this.training.requireManagedSession(
      { id: request.user.sub, role: request.user.role },
      trainingSessionId,
    );
    return session.operatorId;
  }
}
