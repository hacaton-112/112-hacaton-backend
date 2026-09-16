import {
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Query,
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
import {
  InstructorCallListDto,
  StudentProfileDto,
  type InstructorCallView,
} from "@/modules/training/dto/training.dto";
import {
  summarizeStudentCalls,
  TrainingService,
} from "@/modules/training/training.service";

import { DebriefService } from "./application/debrief.service";
import { type Debrief, DebriefDto } from "./dto/debrief.dto";

/** Столько неоценённых звонков дооценивается за одно открытие страницы. */
const MAX_EVALUATIONS_PER_REQUEST = 20;

const actor = (request: AuthenticatedRequest) => ({
  id: request.user.sub,
  role: request.user.role,
});

/** Разборы и успеваемость учеников из кабинета преподавателя: только своих групп. */
@Controller(ApiRoutes.Instructor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class InstructorCallsController {
  private readonly logger = new Logger(InstructorCallsController.name);

  constructor(
    private readonly training: TrainingService,
    private readonly debrief: DebriefService,
  ) {}

  @Get("calls")
  @ZodSerializerDto(InstructorCallListDto)
  async list(
    @Req() request: AuthenticatedRequest,
    @Query("groupId", new ParseUUIDPipe({ optional: true })) groupId?: string,
    @Query("operatorId", new ParseUUIDPipe({ optional: true }))
    operatorId?: string,
  ) {
    const calls = await this.training.listInstructorCalls(actor(request), {
      groupId,
      operatorId,
    });
    return {
      calls: await this.withScores(calls),
    };
  }

  @Get("calls/:trainingSessionId/debrief")
  @ZodSerializerDto(DebriefDto)
  async get(
    @Req() request: AuthenticatedRequest,
    @Param("trainingSessionId", new ParseUUIDPipe()) trainingSessionId: string,
  ): Promise<Debrief> {
    const session = await this.training.requireManagedSession(
      actor(request),
      trainingSessionId,
    );
    return this.debrief.get(trainingSessionId, session.operatorId);
  }

  @Get("students/:userId")
  @ZodSerializerDto(StudentProfileDto)
  async student(
    @Req() request: AuthenticatedRequest,
    @Param("userId", new ParseUUIDPipe()) userId: string,
  ) {
    const student = await this.training.requireManagedStudent(
      actor(request),
      userId,
    );
    const calls = await this.withScores(
      await this.training.listInstructorCalls(actor(request), {
        operatorId: userId,
      }),
    );
    return { student, stats: summarizeStudentCalls(calls), calls };
  }

  /**
   * Оценка звонка считается при первом открытии разбора. Без неё статистика
   * ученика молчала бы о звонках, которые преподаватель ещё не открывал.
   */
  private async withScores(
    calls: InstructorCallView[],
  ): Promise<InstructorCallView[]> {
    const pending = calls
      .filter(({ stage, score }) => stage === "ended" && score === null)
      .slice(0, MAX_EVALUATIONS_PER_REQUEST);
    const scores = new Map<string, number>();

    for (const call of pending) {
      try {
        const debrief = await this.debrief.get(
          call.trainingSessionId,
          call.operatorId,
        );
        if (debrief.evaluation) {
          scores.set(call.trainingSessionId, debrief.evaluation.score);
        }
      } catch (error) {
        // Один сломанный разбор не должен закрывать всю страницу ученика.
        this.logger.warn(
          `Could not evaluate ${call.trainingSessionId}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }

    return calls.map((call) => ({
      ...call,
      score: scores.get(call.trainingSessionId) ?? call.score,
    }));
  }
}
