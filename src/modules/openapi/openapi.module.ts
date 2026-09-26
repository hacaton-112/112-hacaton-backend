import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";

import { OpenApiController } from "./openapi.controller";
import { OpenApiDocumentStore } from "./infrastructure/openapi-document.store";

@Module({
  imports: [AuthModule],
  controllers: [OpenApiController],
  providers: [OpenApiDocumentStore],
  exports: [OpenApiDocumentStore],
})
export class OpenApiModule {}
