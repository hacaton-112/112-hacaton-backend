import { describe, expect, it } from "bun:test";

import {
  ActiveClassifierTreeSchema,
  RouteClassifierResponseSchema,
  type ClassifierTreeNode,
} from "../src/contracts/classifier";
import {
  classifierNodeAtPath,
  findClassifierPath,
} from "../src/services/classifier-tree";

const entryId = "52a2fb62-356f-49c0-a621-882af11e45c8";
const versionId = "7d382312-d69e-4f10-8c77-f7b795707ccd";
const tree: readonly ClassifierTreeNode[] = [
  {
    key: "group-fire",
    label: "Пожары",
    level: "group",
    children: [
      {
        key: "feature-building",
        label: "В здании",
        level: "feature",
        children: [
          {
            key: "leaf-fire",
            label: "Пожар в жилом доме",
            level: "leaf",
            entryId,
            sourceCode: "101",
            children: [],
          },
        ],
      },
    ],
  },
];

describe("classifier contracts", () => {
  it("accepts a versioned recursive tree", () => {
    const payload = ActiveClassifierTreeSchema.parse({
      version: {
        id: versionId,
        version: 1,
        status: "active",
        sourceFileName: "classifier.xlsx",
        sourceSheet: "Лист1",
        sourceSha256: "a".repeat(64),
        recordCount: 1,
        warningCount: 0,
        warnings: [],
        importedAt: "2026-09-16T10:00:00.000Z",
        activatedAt: "2026-09-16T10:01:00.000Z",
        supersededAt: null,
      },
      tree,
    });

    expect(payload.tree[0]?.children[0]?.children[0]?.entryId).toBe(entryId);
  });

  it("accepts the deterministic final type and required services", () => {
    const response = RouteClassifierResponseSchema.parse({
      routing: {
        classifierVersionId: versionId,
        classifierEntryId: entryId,
        sourceCode: "101",
        featurePath: ["В здании"],
        finalType: "Пожар в жилом доме",
        ekpType: "ПОЖАР",
        mainServiceCode: "01",
        qualifierCodes: [],
        requiredServices: [
          {
            code: "svc_fire",
            name: "Пожарная охрана",
            routeLabel: "Выезд",
          },
        ],
      },
      availableQualifiers: [],
    });

    expect(response.routing.finalType).toBe("Пожар в жилом доме");
    expect(response.routing.requiredServices[0]?.name).toBe("Пожарная охрана");
  });
});

describe("classifier tree navigation", () => {
  it("restores the exact branch by immutable leaf id", () => {
    const path = findClassifierPath(tree, entryId);

    expect(path?.map((node) => node.key)).toEqual([
      "group-fire",
      "feature-building",
      "leaf-fire",
    ]);
    expect(
      classifierNodeAtPath(tree, path?.map((node) => node.key) ?? [])?.entryId,
    ).toBe(entryId);
  });
});
