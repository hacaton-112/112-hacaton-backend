import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ZodSerializerDto } from "nestjs-zod";
import { ApiRoutes } from "@/contracts";
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";
import {
  CreatePreparationDto,
  DialoguePreparationDto,
  PreparationRevisionDto,
  ReviewPreparationDto,
} from "./dto/dialogue-preparation.dto";
import { DialoguePreparationService } from "./application/dialogue-preparation.service";

@Controller(`${ApiRoutes.Scenarios}/dialogue-preparations`)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class DialoguePreparationController {
  constructor(private readonly preparations: DialoguePreparationService) {}

  @Post()
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @ZodSerializerDto(DialoguePreparationDto)
  create(
    @Body() body: CreatePreparationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.preparations.create(
      request.user.sub,
      body.scenario,
      body.useAi,
      body,
    );
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.preparations.list(request.user.sub);
  }

  @Get(":id/snapshot")
  @Header("Cache-Control", "no-store")
  snapshot(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.preparations.snapshot(id, request.user.sub);
  }

  @Get(":id")
  @ZodSerializerDto(DialoguePreparationDto)
  status(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.preparations.status(id, request.user.sub);
  }

  @Post(":id/review")
  @ZodSerializerDto(DialoguePreparationDto)
  review(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ReviewPreparationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.preparations.review(
      id,
      request.user.sub,
      body.revision,
      body.entries,
    );
  }

  @Post(":id/approve")
  @ZodSerializerDto(DialoguePreparationDto)
  approve(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: PreparationRevisionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.preparations.approve(id, request.user.sub, body.revision);
  }

  @Post(":id/reopen")
  @ZodSerializerDto(DialoguePreparationDto)
  reopen(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: PreparationRevisionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.preparations.reopen(id, request.user.sub, body.revision);
  }

  @Post(":id/retry")
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @ZodSerializerDto(DialoguePreparationDto)
  retry(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: PreparationRevisionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.preparations.retry(id, request.user.sub, body.revision);
  }

  @Get(":id/audio/:index")
  @Header("Cache-Control", "no-store")
  preview(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("index", ParseIntPipe) index: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.preparations
      .preview(id, request.user.sub, index)
      .then((audio) => new StreamableFile(audio, { type: "audio/wav" }));
  }
}
