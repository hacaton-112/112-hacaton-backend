import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { RolesGuard } from "@/modules/auth/roles.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { VoiceRuntimeService } from "./application/voice-runtime.service";

@Controller("instructor/voice-runtime")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class VoiceRuntimeController {
  constructor(private readonly runtime: VoiceRuntimeService) {}
  @Get() status() {
    return this.runtime.snapshot();
  }
}
