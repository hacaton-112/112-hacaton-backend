import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";
import { JwtAuthGuard, type AuthenticatedRequest } from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";
import { DdsTrainingService } from "./application/dds-training.service";
import { DdsExerciseDto } from "./dto/dds-exercise.dto";
import { DdsLiveListDto, DdsTrainingListDto, ReviewDdsDto, StartAssignedDdsDto, StopDdsDto } from "./dto/dds-training.dto";

@Controller("dds-training")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class DdsTrainingController {
  constructor(private readonly training: DdsTrainingService) {}

  @Post("assignments/:assignmentId/start")
  @Roles("operator")
  @HttpCode(200)
  @ZodSerializerDto(DdsExerciseDto)
  start(@Param("assignmentId", new ParseUUIDPipe()) id: string, @Body() body: StartAssignedDdsDto, @Req() request: AuthenticatedRequest) {
    return this.training.start(request.user.sub, id, body.eventId);
  }

  @Get("live")
  @ZodSerializerDto(DdsLiveListDto)
  async live(@Req() request: AuthenticatedRequest) {
    return this.training.live({ id: request.user.sub, role: request.user.role });
  }

  @Get("attempts")
  @ZodSerializerDto(DdsTrainingListDto)
  async list(@Req() request: AuthenticatedRequest) {
    return this.training.list({ id: request.user.sub, role: request.user.role });
  }

  @Post("attempts/:exerciseId/reviews")
  @HttpCode(204)
  review(@Param("exerciseId", new ParseUUIDPipe()) id: string, @Body() body: ReviewDdsDto, @Req() request: AuthenticatedRequest) {
    return this.training.review({ id: request.user.sub, role: request.user.role }, id, body);
  }

  @Post("attempts/:exerciseId/stop")
  @HttpCode(204)
  stop(@Param("exerciseId", new ParseUUIDPipe()) id: string, @Body() body: StopDdsDto, @Req() request: AuthenticatedRequest) {
    return this.training.stop({ id: request.user.sub, role: request.user.role }, id, body.reason);
  }
}
