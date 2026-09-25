import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from "@nestjs/common";

import { ApiRoutes } from "@/contracts";

import { type AsrHealth, type AsrSession, AsrService } from "./application/asr.service";

interface CreateSessionBody {
  language?: unknown;
}

@Controller(ApiRoutes.Asr)
export class AsrController {
  constructor(private readonly asr: AsrService) {}

  @Get("health")
  health(): Promise<AsrHealth> {
    return this.asr.health();
  }

  @Post("sessions")
  createSession(@Body() body: CreateSessionBody): Promise<AsrSession> {
    const language = body.language ?? "auto";
    if (
      typeof language !== "string" ||
      !/^(auto|[a-zA-Z]{2}(?:[-_][a-zA-Z]{2})?)$/.test(language)
    ) {
      throw new BadRequestException(
        "language must be an ISO-639-1 code, locale, or auto",
      );
    }
    return this.asr.createSession(language);
  }
}
