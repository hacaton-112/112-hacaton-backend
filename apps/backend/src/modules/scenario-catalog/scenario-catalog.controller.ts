import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyReply } from "fastify";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import type { GrammarReport } from "@/modules/grammar";
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";
import { TrainingService } from "@/modules/training/application/training.service";

import { ScenarioAuthoringService } from "./application/scenario-authoring.service";
import { ScenarioGenerationService } from "./application/scenario-generation.service";
import { ScenarioPackageService } from "./application/scenario-package.service";
import {
  CreateScenarioGenerationJobDto,
  ScenarioGenerationJobDto,
  ScenarioGenerationJobListDto,
  type ScenarioGenerationJob,
} from "./dto/scenario-generation.dto";
import {
  EditableScenarioVersionDto,
  GenerateScenarioDraftRequestDto,
  type GenerateScenarioDraftResponse,
  GenerateScenarioDraftResponseDto,
  type PublishScenarioRequest,
  PublishScenarioRequestDto,
  type PublishScenarioVersionRequest,
  PublishScenarioVersionRequestDto,
  PublishedScenarioDto,
} from "./dto/scenario-authoring.dto";
import {
  CheckScenarioGrammarRequestDto,
  ScenarioGrammarReportDto,
} from "./dto/scenario-grammar.dto";
import {
  ScenarioExportQueryDto,
  ScenarioImportReportDto,
  type ScenarioImportReport,
  ScenarioPackageDto,
} from "./dto/scenario-package.dto";
import { type ScenarioList, ScenarioListDto } from "./dto/scenario-summary.dto";
import type {
  EditableScenarioVersion,
  PublishedScenario,
} from "./ports/scenario-authoring.repository";
import {
  SCENARIO_CATALOG,
  type ScenarioCatalog,
} from "./ports/scenario-catalog.port";

/**
 * Сигнал, который гаснет вместе с запросом.
 *
 * Преподаватель закрывает диалог, не дождавшись ответа: держать после этого
 * обращение к модели незачем — оно занимает квоту и вернуть уже некуда.
 *
 * Слушается ответ, а не запрос: `close` на запросе приходит сразу после
 * приёма тела, а `aborted` для такого запроса остаётся `false`, и по ним уход
 * клиента не отличить от нормальной работы. У ответа `close` без
 * `writableEnded` означает ровно одно — на том конце уже никого нет.
 */
const abandonedWith = (reply: FastifyReply): AbortSignal => {
  const abort = new AbortController();

  reply.raw.once("close", () => {
    if (!reply.raw.writableEnded) abort.abort();
  });

  return abort.signal;
};

@Controller(ApiRoutes.Scenarios)
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScenarioCatalogController {
  constructor(
    @Inject(SCENARIO_CATALOG)
    private readonly catalog: ScenarioCatalog,
    private readonly authoring: ScenarioAuthoringService,
    private readonly generation: ScenarioGenerationService,
    private readonly training: TrainingService,
    private readonly packages: ScenarioPackageService,
  ) {}

  /** Сценарии, на которых можно тренироваться прямо сейчас. */
  @Get()
  @ZodSerializerDto(ScenarioListDto)
  async list(@Req() request: AuthenticatedRequest): Promise<ScenarioList> {
    const scenarios = [...(await this.catalog.listPublished())];
    if (request.user.role !== "operator") return { scenarios };

    const allowed = new Set(
      await this.training.listScenarioVersionIdsForOperator(request.user.sub),
    );
    return {
      scenarios: scenarios.filter(({ scenarioVersionId }) =>
        allowed.has(scenarioVersionId),
      ),
    };
  }

  @Get("export")
  @Roles("instructor", "admin")
  @ZodSerializerDto(ScenarioPackageDto)
  async exportPackage(
    @Query() query: ScenarioExportQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header(
      "Content-Disposition",
      `attachment; filename="scenarios-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return this.packages.export(
      query.ids
        ?.split(",")
        .map((id) => id.trim())
        .filter(Boolean) ?? [],
    );
  }

  @Post("import")
  @Roles("instructor", "admin")
  @ZodSerializerDto(ScenarioImportReportDto)
  importPackage(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ScenarioImportReport> {
    const record =
      body !== null && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};
    const { dryRun, ...packageInput } = record;
    return this.packages.import(
      packageInput,
      dryRun === true,
      request.user.sub,
    );
  }

  /** AI only prepares an editable draft; this route never writes to the DB. */
  @Post("assistant/draft")
  @Roles("instructor", "admin")
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @ZodSerializerDto(GenerateScenarioDraftResponseDto)
  generateDraft(
    @Body() body: GenerateScenarioDraftRequestDto,
  ): Promise<GenerateScenarioDraftResponse> {
    return this.authoring.generateDraft(body.brief);
  }

  /**
   * Черновик в фоне: запрос ставит задание и сразу отвечает, генерация идёт
   * в очереди. Каталог показывает задание строкой со статусом.
   */
  @Post("assistant/jobs")
  @Roles("instructor", "admin")
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @ZodSerializerDto(ScenarioGenerationJobDto)
  enqueueDraft(
    @Body() body: CreateScenarioGenerationJobDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ScenarioGenerationJob> {
    return this.generation.enqueue(this.actor(request), body.brief);
  }

  @Get("assistant/jobs")
  @Roles("instructor", "admin")
  @ZodSerializerDto(ScenarioGenerationJobListDto)
  listDraftJobs(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ jobs: ScenarioGenerationJob[] }> {
    return this.generation.list(this.actor(request));
  }

  @Get("assistant/jobs/:jobId")
  @Roles("instructor", "admin")
  @ZodSerializerDto(ScenarioGenerationJobDto)
  getDraftJob(
    @Param("jobId") jobId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ScenarioGenerationJob> {
    return this.generation.get(this.actor(request), jobId);
  }

  /** Убирает законченное задание из списка; черновик в нём остаётся в базе. */
  @Delete("assistant/jobs/:jobId")
  @Roles("instructor", "admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismissDraftJob(
    @Param("jobId") jobId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.generation.dismiss(this.actor(request), jobId);
  }

  /**
   * Принудительная проверка грамотности сценария из ТЗ.
   *
   * Ничего не сохраняет: преподаватель просит её после ручной правки и сам
   * решает, что исправлять.
   */
  @Post("grammar-check")
  @Roles("instructor", "admin")
  @Throttle({ short: { limit: 20, ttl: 60_000 } })
  @ZodSerializerDto(ScenarioGrammarReportDto)
  checkGrammar(
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: CheckScenarioGrammarRequestDto,
  ): Promise<GrammarReport> {
    return this.authoring.checkGrammar(
      body.scenario,
      body.deepReview,
      abandonedWith(reply),
    );
  }

  /** Publishing is an explicit instructor action after the complete review. */
  @Post()
  @Roles("instructor", "admin")
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @ZodSerializerDto(PublishedScenarioDto)
  publish(
    @Body() body: PublishScenarioRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PublishedScenario> {
    return this.authoring.publish(
      body as PublishScenarioRequest,
      request.user.sub,
    );
  }

  /**
   * Опубликованная версия целиком: для брифинга и для правки в конструкторе.
   *
   * Только преподавателю — оператор, увидевший факты и эталон до звонка,
   * перестаёт их выяснять.
   */
  @Get("versions/:scenarioVersionId")
  @Roles("instructor", "admin")
  @ZodSerializerDto(EditableScenarioVersionDto)
  loadVersion(
    @Param("scenarioVersionId", new ParseUUIDPipe()) scenarioVersionId: string,
  ): Promise<EditableScenarioVersion> {
    return this.authoring.loadVersion(scenarioVersionId);
  }

  /** Правка публикуется новой версией поверх той, что была открыта. */
  @Post(":scenarioId/versions")
  @Roles("instructor", "admin")
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @ZodSerializerDto(PublishedScenarioDto)
  publishVersion(
    @Param("scenarioId", new ParseUUIDPipe()) scenarioId: string,
    @Body() body: PublishScenarioVersionRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PublishedScenario> {
    return this.authoring.publishVersion(
      scenarioId,
      body as PublishScenarioVersionRequest,
      request.user.sub,
    );
  }

  /**
   * Удаление сценария из каталога.
   *
   * Сценарий снимается, а не стирается: проведённые по нему звонки и их
   * разборы остаются. Повторный запрос тоже отвечает `204`.
   */
  @Delete(":scenarioId")
  @Roles("instructor", "admin")
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  archive(
    @Param("scenarioId", new ParseUUIDPipe()) scenarioId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.authoring.archive(scenarioId, request.user.sub);
  }

  private actor(request: AuthenticatedRequest) {
    return { id: request.user.sub, role: request.user.role };
  }
}
