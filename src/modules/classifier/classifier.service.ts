import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, max } from "drizzle-orm";

import {
  AppBadRequestException,
  AppNotFoundException,
} from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  classifierEntries,
  classifierRoutingRules,
  classifierServices,
  classifierVersions,
  type ClassifierVersionRecord,
} from "@/drizzle/schema";
import { AuditLogService } from "@/modules/audit-log/audit-log.service";

import {
  CLASSIFIER_SHEET_NAME,
  ClassifierImportError,
  parseClassifierWorkbook,
} from "./domain/classifier-import";
import {
  buildClassifierTree,
  classifierQualifiers,
  routeClassifierEntry,
  type ClassifierRouteRuleView,
} from "./domain/classifier-routing";
import type {
  ActiveClassifierTree,
  ClassifierVersion,
  ClassifierVersionList,
  RouteClassifierResponse,
} from "./dto/classifier.dto";
import {
  CLASSIFIER_WORKBOOK_READER,
  type ClassifierWorkbookReader,
} from "./ports/classifier-workbook-reader.port";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const INSERT_BATCH_SIZE = 250;

export interface ClassifierUpload {
  readonly originalname: string;
  readonly mimetype: string;
  readonly size: number;
  readonly buffer: Buffer;
}

const batches = <T>(items: readonly T[]): readonly (readonly T[])[] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += INSERT_BATCH_SIZE) {
    result.push(items.slice(index, index + INSERT_BATCH_SIZE));
  }
  return result;
};

@Injectable()
export class ClassifierService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleService["db"],
    @Inject(CLASSIFIER_WORKBOOK_READER)
    private readonly workbookReader: ClassifierWorkbookReader,
    private readonly audit: AuditLogService,
  ) {}

  async importVersion(
    file: ClassifierUpload | undefined,
    actorId: string,
  ): Promise<ClassifierVersion> {
    this.validateFile(file);
    const upload = file as ClassifierUpload;
    const sourceSha256 = createHash("sha256")
      .update(upload.buffer)
      .digest("hex");
    const [existing] = await this.db
      .select()
      .from(classifierVersions)
      .where(eq(classifierVersions.sourceSha256, sourceSha256))
      .limit(1);

    if (existing) return this.presentVersion(existing);

    let parsed;
    try {
      const rows = await this.workbookReader.read(
        upload.buffer,
        CLASSIFIER_SHEET_NAME,
      );
      parsed = parseClassifierWorkbook(rows);
    } catch (error) {
      if (error instanceof ClassifierImportError) {
        const detail = error.issues
          .slice(0, 20)
          .map((issue) => `${issue.column}${issue.row}: ${issue.message}`)
          .join("; ");
        throw new AppBadRequestException(
          ErrorCodes.CLASSIFIER_IMPORT_INVALID,
          detail || "Classifier workbook is invalid",
        );
      }

      throw new AppBadRequestException(
        ErrorCodes.CLASSIFIER_IMPORT_INVALID,
        "The uploaded file is not a readable XLSX classifier",
      );
    }

    const [{ latestVersion }] = await this.db
      .select({ latestVersion: max(classifierVersions.version) })
      .from(classifierVersions);
    const versionId = generateId();
    const versionNumber = (latestVersion ?? 0) + 1;

    const saved = await this.db.transaction(async (tx) => {
      const [version] = await tx
        .insert(classifierVersions)
        .values({
          id: versionId,
          version: versionNumber,
          sourceFileName: upload.originalname,
          sourceSheet: parsed.sheetName,
          sourceSha256,
          recordCount: parsed.entries.length,
          warningCount: parsed.warnings.length,
          warnings: parsed.warnings,
          importedBy: actorId,
        })
        .returning();

      if (!version) throw new Error("Classifier version was not inserted");

      const entryRows = parsed.entries.map((entry) => ({
        id: generateId(),
        versionId,
        sourceCode: entry.sourceCode,
        sourceRow: entry.sourceRow,
        groupName: entry.groupName,
        statisticalGroup: entry.statisticalGroup,
        feature1: entry.feature1,
        feature2: entry.feature2,
        feature3: entry.feature3,
        additionalSigns: entry.additionalSigns,
        finalType: entry.finalType,
        ekpType: entry.ekpType,
        mainServiceCode: entry.mainServiceCode,
        operatorVisible: entry.operatorVisible,
      }));
      const entryIds = new Map(
        entryRows.map((entry) => [entry.sourceCode, entry.id]),
      );

      for (const batch of batches(entryRows)) {
        await tx.insert(classifierEntries).values([...batch]);
      }

      const serviceDefinitions = new Map<
        string,
        { code: string; name: string; sourceHeader: string }
      >();
      for (const entry of parsed.entries) {
        for (const route of entry.routes) {
          serviceDefinitions.set(route.serviceCode, {
            code: route.serviceCode,
            name: route.serviceName,
            sourceHeader: route.sourceHeader,
          });
        }
      }

      const serviceRows = [...serviceDefinitions.values()].map((service) => ({
        id: generateId(),
        versionId,
        ...service,
      }));
      const serviceIds = new Map(
        serviceRows.map((service) => [service.code, service.id]),
      );

      for (const batch of batches(serviceRows)) {
        await tx.insert(classifierServices).values([...batch]);
      }

      const ruleRows = parsed.entries.flatMap((entry) => {
        const entryId = entryIds.get(entry.sourceCode);
        if (!entryId) throw new Error("Classifier entry id is missing");

        return entry.routes.map((route) => {
          const serviceId = serviceIds.get(route.serviceCode);
          if (!serviceId) throw new Error("Classifier service id is missing");

          return {
            id: generateId(),
            entryId,
            serviceId,
            mode: route.mode,
            qualifierCode: route.qualifierCode,
            qualifierLabel: route.qualifierLabel,
            routeLabel: route.routeLabel,
            sourceColumn: route.sourceColumn,
            orderIndex: route.orderIndex,
          };
        });
      });

      for (const batch of batches(ruleRows)) {
        await tx.insert(classifierRoutingRules).values([...batch]);
      }

      await this.audit.log(
        {
          actorId,
          action: "classifier.version.imported",
          resource: "classifier_version",
          resourceId: versionId,
          details: {
            version: versionNumber,
            sourceSha256,
            recordCount: parsed.entries.length,
            warningCount: parsed.warnings.length,
          },
        },
        tx,
      );

      return version;
    });

    return this.presentVersion(saved);
  }

  async listVersions(): Promise<ClassifierVersionList> {
    const versions = await this.db
      .select()
      .from(classifierVersions)
      .orderBy(desc(classifierVersions.version));
    return {
      versions: versions.map((version) => this.presentVersion(version)),
    };
  }

  async activate(
    versionId: string,
    actorId: string,
  ): Promise<ClassifierVersion> {
    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(classifierVersions)
        .where(eq(classifierVersions.id, versionId))
        .limit(1);

      if (!target) {
        throw new AppNotFoundException(
          ErrorCodes.CLASSIFIER_VERSION_NOT_FOUND,
          "Classifier version does not exist",
        );
      }
      if (target.status === "active") return this.presentVersion(target);

      const now = new Date();
      await tx
        .update(classifierVersions)
        .set({ status: "superseded", supersededAt: now })
        .where(eq(classifierVersions.status, "active"));
      const [active] = await tx
        .update(classifierVersions)
        .set({
          status: "active",
          activatedAt: now,
          supersededAt: null,
        })
        .where(eq(classifierVersions.id, versionId))
        .returning();

      if (!active) throw new Error("Classifier version was not activated");

      await this.audit.log(
        {
          actorId,
          action: "classifier.version.activated",
          resource: "classifier_version",
          resourceId: versionId,
          details: { version: target.version },
        },
        tx,
      );

      return this.presentVersion(active);
    });
  }

  async activeTree(includeHidden = false): Promise<ActiveClassifierTree> {
    const [version] = await this.db
      .select()
      .from(classifierVersions)
      .where(eq(classifierVersions.status, "active"))
      .limit(1);

    if (!version) {
      throw new AppNotFoundException(
        ErrorCodes.CLASSIFIER_ACTIVE_VERSION_NOT_FOUND,
        "There is no active classifier version",
      );
    }

    const entries = await this.db
      .select({
        id: classifierEntries.id,
        sourceCode: classifierEntries.sourceCode,
        groupName: classifierEntries.groupName,
        feature1: classifierEntries.feature1,
        feature2: classifierEntries.feature2,
        feature3: classifierEntries.feature3,
        finalType: classifierEntries.finalType,
        operatorVisible: classifierEntries.operatorVisible,
      })
      .from(classifierEntries)
      .where(eq(classifierEntries.versionId, version.id));

    return {
      version: this.presentVersion(version),
      tree: [...buildClassifierTree(entries, includeHidden)],
    };
  }

  routeActive(
    entryId: string,
    qualifierCodes: readonly string[],
  ): Promise<RouteClassifierResponse> {
    return this.route(entryId, qualifierCodes, true);
  }

  routeStored(
    entryId: string,
    qualifierCodes: readonly string[],
  ): Promise<RouteClassifierResponse> {
    return this.route(entryId, qualifierCodes, false);
  }

  private async route(
    entryId: string,
    qualifierCodes: readonly string[],
    activeOnly: boolean,
  ): Promise<RouteClassifierResponse> {
    const conditions = [eq(classifierEntries.id, entryId)];
    if (activeOnly) conditions.push(eq(classifierVersions.status, "active"));

    const [entry] = await this.db
      .select({
        id: classifierEntries.id,
        versionId: classifierEntries.versionId,
        sourceCode: classifierEntries.sourceCode,
        groupName: classifierEntries.groupName,
        feature1: classifierEntries.feature1,
        feature2: classifierEntries.feature2,
        feature3: classifierEntries.feature3,
        finalType: classifierEntries.finalType,
        ekpType: classifierEntries.ekpType,
        mainServiceCode: classifierEntries.mainServiceCode,
        operatorVisible: classifierEntries.operatorVisible,
      })
      .from(classifierEntries)
      .innerJoin(
        classifierVersions,
        eq(classifierVersions.id, classifierEntries.versionId),
      )
      .where(and(...conditions))
      .limit(1);

    if (!entry) {
      throw new AppNotFoundException(
        ErrorCodes.CLASSIFIER_ENTRY_NOT_FOUND,
        "Classifier entry does not exist in the requested version",
      );
    }

    const rules: ClassifierRouteRuleView[] = await this.db
      .select({
        serviceCode: classifierServices.code,
        serviceName: classifierServices.name,
        mode: classifierRoutingRules.mode,
        qualifierCode: classifierRoutingRules.qualifierCode,
        qualifierLabel: classifierRoutingRules.qualifierLabel,
        routeLabel: classifierRoutingRules.routeLabel,
        orderIndex: classifierRoutingRules.orderIndex,
      })
      .from(classifierRoutingRules)
      .innerJoin(
        classifierServices,
        eq(classifierServices.id, classifierRoutingRules.serviceId),
      )
      .where(eq(classifierRoutingRules.entryId, entryId));
    const availableQualifiers = classifierQualifiers(rules);
    const allowed = new Set(availableQualifiers.map(({ code }) => code));
    const invalid = qualifierCodes.find((code) => !allowed.has(code));

    if (invalid) {
      throw new AppBadRequestException(
        ErrorCodes.CLASSIFIER_QUALIFIER_INVALID,
        `Qualifier ${invalid} is not available for this classifier entry`,
      );
    }

    return {
      routing: routeClassifierEntry({ entry, rules, qualifierCodes }),
      availableQualifiers: [...availableQualifiers],
    };
  }

  private validateFile(
    file: ClassifierUpload | undefined,
  ): asserts file is ClassifierUpload {
    if (!file) {
      throw new AppBadRequestException(
        ErrorCodes.CLASSIFIER_FILE_REQUIRED,
        "An XLSX classifier file is required",
      );
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      throw new AppBadRequestException(
        ErrorCodes.CLASSIFIER_IMPORT_INVALID,
        "Classifier file must be between 1 byte and 10 MB",
      );
    }
    if (!file.originalname.toLocaleLowerCase("en-US").endsWith(".xlsx")) {
      throw new AppBadRequestException(
        ErrorCodes.CLASSIFIER_IMPORT_INVALID,
        "Classifier file must use the .xlsx format",
      );
    }
  }

  private presentVersion(version: ClassifierVersionRecord): ClassifierVersion {
    return {
      id: version.id,
      version: version.version,
      status: version.status,
      sourceFileName: version.sourceFileName,
      sourceSheet: version.sourceSheet,
      sourceSha256: version.sourceSha256,
      recordCount: version.recordCount,
      warningCount: version.warningCount,
      warnings: [...version.warnings],
      importedAt: version.importedAt.toISOString(),
      activatedAt: version.activatedAt?.toISOString() ?? null,
      supersededAt: version.supersededAt?.toISOString() ?? null,
    };
  }
}
