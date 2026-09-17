import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { DdsExerciseService } from "./application/dds-exercise.service";
import {
  type DdsExercise,
  DdsExerciseDto,
  type DdsExerciseList,
  DdsExerciseListDto,
  type StartDdsExerciseRequest,
  StartDdsExerciseRequestDto,
  type TransitionDdsExerciseRequest,
  TransitionDdsExerciseRequestDto,
} from "./dto/dds-exercise.dto";

@Controller(ApiRoutes.DdsExercises)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("operator", "instructor", "admin")
export class DdsExerciseController {
  constructor(private readonly exercises: DdsExerciseService) {}

  @Get()
  @ZodSerializerDto(DdsExerciseListDto)
  async list(@Req() request: AuthenticatedRequest): Promise<DdsExerciseList> {
    return { exercises: [...(await this.exercises.list(request.user.sub))] };
  }

  @Post()
  @ZodSerializerDto(DdsExerciseDto)
  start(
    @Body() body: StartDdsExerciseRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DdsExercise> {
    return this.exercises.start(
      request.user.sub,
      body as StartDdsExerciseRequest,
    );
  }

  @Get(":exerciseId")
  @ZodSerializerDto(DdsExerciseDto)
  get(
    @Param("exerciseId", new ParseUUIDPipe()) exerciseId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<DdsExercise> {
    return this.exercises.get(exerciseId, request.user.sub);
  }

  @Post(":exerciseId/transitions")
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(DdsExerciseDto)
  transition(
    @Param("exerciseId", new ParseUUIDPipe()) exerciseId: string,
    @Body() body: TransitionDdsExerciseRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<DdsExercise> {
    return this.exercises.transition(
      exerciseId,
      request.user.sub,
      body as TransitionDdsExerciseRequest,
    );
  }
}
