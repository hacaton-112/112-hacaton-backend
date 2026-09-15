import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import type { AuthenticatedRequest } from "@/modules/auth/jwt-auth.guard";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { TrainingService } from "./training.service";
import {
  AddTrainingGroupMemberDto,
  CreateTrainingAssignmentDto,
  CreateTrainingGroupDto,
  GroupStudentListDto,
  StudentListDto,
  OperatorOptionListDto,
  TrainingAssignmentDto,
  TrainingAssignmentListDto,
  TrainingGroupDto,
  TrainingGroupListDto,
  UpdateTrainingAssignmentDto,
  UpdateTrainingGroupDto,
  UpdateTrainingGroupMemberDto,
} from "./dto/training.dto";

const actor = (request: AuthenticatedRequest) => ({
  id: request.user.sub,
  role: request.user.role,
});

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get("groups")
  @Roles("instructor", "admin")
  @ZodSerializerDto(TrainingGroupListDto)
  async groups(@Req() request: AuthenticatedRequest) {
    return { groups: await this.training.listGroups(actor(request)) };
  }

  @Get("groups/operators")
  @Roles("instructor", "admin")
  @ZodSerializerDto(OperatorOptionListDto)
  async operators() {
    return { operators: await this.training.listOperators() };
  }

  @Post("groups")
  @Roles("instructor", "admin")
  @ZodSerializerDto(TrainingGroupDto)
  createGroup(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateTrainingGroupDto,
  ) {
    return this.training.createGroup(actor(request), body);
  }

  @Get("groups/:groupId")
  @Roles("instructor", "admin")
  @ZodSerializerDto(TrainingGroupDto)
  group(
    @Req() request: AuthenticatedRequest,
    @Param("groupId", new ParseUUIDPipe()) groupId: string,
  ) {
    return this.training.getGroup(actor(request), groupId);
  }

  @Get("instructor/students")
  @Roles("instructor", "admin")
  @ZodSerializerDto(StudentListDto)
  async students(@Req() request: AuthenticatedRequest) {
    return { students: await this.training.listStudents(actor(request)) };
  }

  @Get("groups/:groupId/students")
  @Roles("instructor", "admin")
  @ZodSerializerDto(GroupStudentListDto)
  async groupStudents(
    @Req() request: AuthenticatedRequest,
    @Param("groupId", new ParseUUIDPipe()) groupId: string,
  ) {
    return {
      students: await this.training.listGroupStudents(actor(request), groupId),
    };
  }

  @Patch("groups/:groupId")
  @Roles("instructor", "admin")
  @ZodSerializerDto(TrainingGroupDto)
  updateGroup(
    @Req() request: AuthenticatedRequest,
    @Param("groupId", new ParseUUIDPipe()) groupId: string,
    @Body() body: UpdateTrainingGroupDto,
  ) {
    return this.training.updateGroup(actor(request), groupId, body);
  }

  @Delete("groups/:groupId")
  @Roles("instructor", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGroup(
    @Req() request: AuthenticatedRequest,
    @Param("groupId", new ParseUUIDPipe()) groupId: string,
  ) {
    await this.training.deleteGroup(actor(request), groupId);
  }

  @Post("groups/:groupId/members")
  @Roles("instructor", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async addMember(
    @Req() request: AuthenticatedRequest,
    @Param("groupId", new ParseUUIDPipe()) groupId: string,
    @Body() body: AddTrainingGroupMemberDto,
  ) {
    await this.training.addMember(actor(request), groupId, body);
  }

  @Patch("groups/:groupId/members/:userId")
  @Roles("instructor", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateMember(
    @Req() request: AuthenticatedRequest,
    @Param("groupId", new ParseUUIDPipe()) groupId: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: UpdateTrainingGroupMemberDto,
  ) {
    await this.training.updateMember(actor(request), groupId, userId, body);
  }

  @Delete("groups/:groupId/members/:userId")
  @Roles("instructor", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Req() request: AuthenticatedRequest,
    @Param("groupId", new ParseUUIDPipe()) groupId: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
  ) {
    await this.training.removeMember(actor(request), groupId, userId);
  }

  @Get("assignments")
  @Roles("instructor", "admin")
  @ZodSerializerDto(TrainingAssignmentListDto)
  async assignments(@Req() request: AuthenticatedRequest) {
    return {
      assignments: await this.training.listAssignments(actor(request)),
    };
  }

  @Get("assignments/my")
  @Roles("operator")
  @ZodSerializerDto(TrainingAssignmentListDto)
  async myAssignments(@Req() request: AuthenticatedRequest) {
    return {
      assignments: await this.training.listMyAssignments(request.user.sub),
    };
  }

  @Post("assignments")
  @Roles("instructor", "admin")
  @ZodSerializerDto(TrainingAssignmentDto)
  createAssignment(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateTrainingAssignmentDto,
  ) {
    return this.training.createAssignment(actor(request), body);
  }

  @Patch("assignments/:assignmentId")
  @Roles("instructor", "admin")
  @ZodSerializerDto(TrainingAssignmentDto)
  updateAssignment(
    @Req() request: AuthenticatedRequest,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
    @Body() body: UpdateTrainingAssignmentDto,
  ) {
    return this.training.updateAssignment(actor(request), assignmentId, body);
  }

  @Delete("assignments/:assignmentId")
  @Roles("instructor", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAssignment(
    @Req() request: AuthenticatedRequest,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
  ) {
    await this.training.deleteAssignment(actor(request), assignmentId);
  }

  @Post("assignments/:assignmentId/launch")
  @Roles("instructor", "admin")
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(TrainingAssignmentDto)
  launchAssignment(
    @Req() request: AuthenticatedRequest,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
  ) {
    return this.training.launchAssignmentById(actor(request), assignmentId);
  }

  @Post("assignments/:assignmentId/complete")
  @Roles("instructor", "admin")
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(TrainingAssignmentDto)
  completeAssignment(
    @Req() request: AuthenticatedRequest,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
  ) {
    return this.training.completeAssignmentById(actor(request), assignmentId);
  }

  @Post("assignments/:assignmentId/archive")
  @Roles("instructor", "admin")
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(TrainingAssignmentDto)
  archiveAssignment(
    @Req() request: AuthenticatedRequest,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
  ) {
    return this.training.archiveAssignmentById(actor(request), assignmentId);
  }
}
