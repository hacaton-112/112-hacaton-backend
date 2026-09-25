import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { AppConflictException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { AuthenticatedRequest } from "@/modules/auth/jwt-auth.guard";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";
import { TrainingService } from "@/modules/training/application/training.service";
import {
  EndTrainingSessionDto,
  EndTrainingSessionResponseDto,
  LiveTrainingSessionListDto,
} from "@/modules/training/dto/training.dto";

import { VoicePipelineGateway } from "./transport/websocket/voice-pipeline.gateway";

const actor = (request: AuthenticatedRequest) => ({
  id: request.user.sub,
  role: request.user.role,
});

@Controller("instructor")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class InstructorSessionsController {
  constructor(
    private readonly training: TrainingService,
    private readonly gateway: VoicePipelineGateway,
  ) {}

  @Get("live-sessions")
  @ZodSerializerDto(LiveTrainingSessionListDto)
  async list(
    @Req() request: AuthenticatedRequest,
    @Query("groupId", new ParseUUIDPipe({ optional: true })) groupId?: string,
  ) {
    return {
      sessions: await this.training.listLiveSessions(actor(request), groupId),
    };
  }

  @Post("sessions/:sessionId/end")
  @ZodSerializerDto(EndTrainingSessionResponseDto)
  async end(
    @Req() request: AuthenticatedRequest,
    @Param("sessionId", new ParseUUIDPipe()) sessionId: string,
    @Body() body: EndTrainingSessionDto,
  ) {
    const currentActor = actor(request);
    const session = await this.training.requireManagedSession(
      currentActor,
      sessionId,
    );
    if (
      session.attemptStatus !== "offered" &&
      session.attemptStatus !== "active"
    ) {
      throw new AppConflictException(
        ErrorCodes.TRAINING_SESSION_NOT_ACTIVE,
        "The training session has already ended",
      );
    }
    const endedAt = await this.gateway.endSessionByInstructor(
      sessionId,
      currentActor.id,
      body.reason,
    );
    return {
      trainingSessionId: sessionId,
      status: "cancelled_by_instructor" as const,
      endedAt: endedAt.toISOString(),
    };
  }
}
