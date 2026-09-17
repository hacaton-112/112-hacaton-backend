import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";

import { MethodicalMaterialsController } from "./methodical-materials.controller";
import { MethodicalMaterialsService } from "./methodical-materials.service";

@Module({
  imports: [AuthModule],
  controllers: [MethodicalMaterialsController],
  providers: [MethodicalMaterialsService],
  exports: [MethodicalMaterialsService],
})
export class MethodicalMaterialsModule {}
