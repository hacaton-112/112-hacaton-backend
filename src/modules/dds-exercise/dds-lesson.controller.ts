import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { DdsLessonService } from "./application/dds-lesson.service";
import {
  ActiveDdsLessonListDto,
  CreateDdsLessonDto,
  type CreateDdsLesson,
  DdsLessonDto,
  DdsLessonListDto,
  FinishDdsLessonDto,
  NextDdsLessonCardDto,
  NextDdsLessonCardResponseDto,
} from "./dto/dds-lesson.dto";

@Controller("dds-lessons")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class DdsLessonController {
  constructor(private readonly lessons: DdsLessonService) {}

  @Post()
  @ZodSerializerDto(DdsLessonDto)
  create(
    @Body() body: CreateDdsLessonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lessons.create(
      { id: request.user.sub, role: request.user.role },
      body as CreateDdsLesson,
    );
  }

  @Get("my/active")
  @Roles("operator")
  @ZodSerializerDto(ActiveDdsLessonListDto)
  myActive(@Req() request: AuthenticatedRequest) {
    return this.lessons.myActive(request.user.sub);
  }

  @Post(":lessonId/next")
  @Roles("operator")
  @HttpCode(200)
  @ZodSerializerDto(NextDdsLessonCardResponseDto)
  next(
    @Param("lessonId", new ParseUUIDPipe()) lessonId: string,
    @Body() body: NextDdsLessonCardDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lessons.next(request.user.sub, lessonId, body.eventId);
  }

  @Post(":lessonId/finish")
  @HttpCode(200)
  @ZodSerializerDto(DdsLessonDto)
  finish(
    @Param("lessonId", new ParseUUIDPipe()) lessonId: string,
    @Body() body: FinishDdsLessonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lessons.finish(
      { id: request.user.sub, role: request.user.role },
      lessonId,
      body.eventId,
    );
  }

  @Get()
  @ZodSerializerDto(DdsLessonListDto)
  list(@Req() request: AuthenticatedRequest) {
    return this.lessons.list({
      id: request.user.sub,
      role: request.user.role,
    });
  }

  @Get(":lessonId")
  @ZodSerializerDto(DdsLessonDto)
  get(
    @Param("lessonId", new ParseUUIDPipe()) lessonId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.lessons.get(
      { id: request.user.sub, role: request.user.role },
      lessonId,
    );
  }
}
