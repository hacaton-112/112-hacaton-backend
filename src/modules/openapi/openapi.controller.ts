import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import type { OpenAPIObject } from "@nestjs/swagger";

import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { openApiHtml } from "./openapi-document";
import { OpenApiDocumentStore } from "./openapi-document.store";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class OpenApiController {
  constructor(private readonly documents: OpenApiDocumentStore) {}

  @Get("openapi.json")
  openApi(): OpenAPIObject {
    return this.documents.get();
  }

  @Get("docs")
  @Header("Content-Type", "text/html; charset=utf-8")
  docs(): string {
    return openApiHtml(this.documents.get());
  }
}
