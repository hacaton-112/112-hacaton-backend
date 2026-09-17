import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import {
  ActiveClassifierTreeDto,
  type ActiveClassifierTree,
  type ClassifierVersion,
  ClassifierVersionDto,
  type ClassifierVersionList,
  ClassifierVersionListDto,
  type RouteClassifierResponse,
  RouteClassifierRequestDto,
  RouteClassifierResponseDto,
} from "./dto/classifier.dto";
import { ClassifierService, type ClassifierUpload } from "./classifier.service";

@Controller(ApiRoutes.Classifiers)
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassifierController {
  constructor(private readonly classifier: ClassifierService) {}

  @Get("versions")
  @Roles("instructor", "admin")
  @ZodSerializerDto(ClassifierVersionListDto)
  listVersions(): Promise<ClassifierVersionList> {
    return this.classifier.listVersions();
  }

  @Post("versions/import")
  @Roles("admin")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { files: 1, fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ZodSerializerDto(ClassifierVersionDto)
  importVersion(
    @UploadedFile() file: ClassifierUpload | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ClassifierVersion> {
    return this.classifier.importVersion(file, request.user.sub);
  }

  @Post("versions/:versionId/activate")
  @Roles("admin")
  @ZodSerializerDto(ClassifierVersionDto)
  activate(
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ClassifierVersion> {
    return this.classifier.activate(versionId, request.user.sub);
  }

  @Get("active/tree")
  @Roles("operator", "instructor", "admin")
  @ZodSerializerDto(ActiveClassifierTreeDto)
  activeTree(
    @Req() request: AuthenticatedRequest,
  ): Promise<ActiveClassifierTree> {
    return this.classifier.activeTree(request.user.role !== "operator");
  }

  @Post("active/route")
  @Roles("operator", "instructor", "admin")
  @ZodSerializerDto(RouteClassifierResponseDto)
  route(
    @Body() body: RouteClassifierRequestDto,
  ): Promise<RouteClassifierResponse> {
    return this.classifier.routeActive(body.entryId, body.qualifierCodes);
  }
}
