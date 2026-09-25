import { z } from "zod";

export const ClassifierImportWarningSchema = z.object({
  code: z.enum(["missing_ekp_type", "missing_main_service"]),
  row: z.number().int().positive(),
  column: z.string().min(1),
  message: z.string().min(1),
});

export const ClassifierVersionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(["draft", "active", "superseded"]),
  sourceFileName: z.string().min(1),
  sourceSheet: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  recordCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  warnings: z.array(ClassifierImportWarningSchema),
  importedAt: z.iso.datetime(),
  activatedAt: z.iso.datetime().nullable(),
  supersededAt: z.iso.datetime().nullable(),
});

export const ClassifierVersionListSchema = z.object({
  versions: z.array(ClassifierVersionSchema),
});

export interface ClassifierTreeNode {
  readonly key: string;
  readonly label: string;
  readonly level: "group" | "feature" | "leaf";
  readonly children: readonly ClassifierTreeNode[];
  readonly entryId?: string;
  readonly sourceCode?: string;
}

export const ClassifierTreeNodeSchema: z.ZodType<ClassifierTreeNode> = z.lazy(
  () =>
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      level: z.enum(["group", "feature", "leaf"]),
      children: z.array(ClassifierTreeNodeSchema),
      entryId: z.string().uuid().optional(),
      sourceCode: z.string().min(1).optional(),
    }),
);

export const ActiveClassifierTreeSchema = z.object({
  version: ClassifierVersionSchema,
  tree: z.array(ClassifierTreeNodeSchema),
});

export const ClassifierRequiredServiceSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  routeLabel: z.string().min(1),
});

export const ClassifierRoutingSchema = z.object({
  classifierVersionId: z.string().uuid(),
  classifierEntryId: z.string().uuid(),
  sourceCode: z.string().min(1),
  featurePath: z.array(z.string().min(1)).min(1).max(3),
  finalType: z.string().min(1),
  ekpType: z.string().min(1).nullable(),
  mainServiceCode: z.string().min(1).nullable(),
  qualifierCodes: z.array(z.string().min(1)),
  requiredServices: z.array(ClassifierRequiredServiceSchema),
});

export const RouteClassifierResponseSchema = z.object({
  routing: ClassifierRoutingSchema,
  availableQualifiers: z.array(
    z.object({ code: z.string().min(1), label: z.string().min(1) }),
  ),
});

export type ClassifierVersion = z.infer<typeof ClassifierVersionSchema>;
export type ActiveClassifierTree = z.infer<typeof ActiveClassifierTreeSchema>;
export type ClassifierRouting = z.infer<typeof ClassifierRoutingSchema>;
export type RouteClassifierResponse = z.infer<
  typeof RouteClassifierResponseSchema
>;
