import { createHash } from "node:crypto";

import type {
  ClassifierRuleMode,
  ClassifierRoutingSnapshot,
} from "@/drizzle/schema";

export interface ClassifierTreeEntry {
  readonly id: string;
  readonly sourceCode: string;
  readonly groupName: string | null;
  readonly feature1: string;
  readonly feature2: string | null;
  readonly feature3: string | null;
  readonly finalType: string;
  readonly operatorVisible: boolean;
}

export interface ClassifierTreeNode {
  readonly key: string;
  readonly label: string;
  readonly level: "group" | "feature" | "leaf";
  readonly children: readonly ClassifierTreeNode[];
  readonly entryId?: string;
  readonly sourceCode?: string;
}

export interface ClassifierRouteRuleView {
  readonly serviceCode: string;
  readonly serviceName: string;
  readonly mode: ClassifierRuleMode;
  readonly qualifierCode: string | null;
  readonly qualifierLabel: string | null;
  readonly routeLabel: string;
  readonly orderIndex: number;
}

export interface ClassifierRouteEntryView extends ClassifierTreeEntry {
  readonly versionId: string;
  readonly ekpType: string | null;
  readonly mainServiceCode: string | null;
}

export interface ClassifierQualifier {
  readonly code: string;
  readonly label: string;
}

interface MutableTreeNode {
  key: string;
  label: string;
  level: "group" | "feature" | "leaf";
  children: Map<string, MutableTreeNode>;
  entryId?: string;
  sourceCode?: string;
}

const nodeKey = (path: readonly string[]): string =>
  `node_${createHash("sha256").update(path.join("\u001f")).digest("hex").slice(0, 16)}`;

const sorted = (
  nodes: Iterable<MutableTreeNode>,
): readonly ClassifierTreeNode[] =>
  [...nodes]
    .sort((left, right) => left.label.localeCompare(right.label, "ru"))
    .map((node) => ({
      key: node.key,
      label: node.label,
      level: node.level,
      children: sorted(node.children.values()),
      ...(node.entryId ? { entryId: node.entryId } : {}),
      ...(node.sourceCode ? { sourceCode: node.sourceCode } : {}),
    }));

export const buildClassifierTree = (
  entries: readonly ClassifierTreeEntry[],
  includeHidden = false,
): readonly ClassifierTreeNode[] => {
  const root = new Map<string, MutableTreeNode>();

  for (const entry of entries) {
    if (!includeHidden && !entry.operatorVisible) continue;

    const branch = [
      entry.groupName ?? "Без группы",
      entry.feature1,
      entry.feature2,
      entry.feature3,
    ].filter((value): value is string => value !== null);
    let siblings = root;
    const path: string[] = [];

    branch.forEach((label, index) => {
      path.push(label);
      const key = nodeKey(path);
      let node = siblings.get(key);

      if (!node) {
        node = {
          key,
          label,
          level: index === 0 ? "group" : "feature",
          children: new Map(),
        };
        siblings.set(key, node);
      }

      siblings = node.children;
    });

    const leaf: MutableTreeNode = {
      key: `leaf_${entry.id}`,
      label: entry.finalType,
      level: "leaf",
      children: new Map(),
      entryId: entry.id,
      sourceCode: entry.sourceCode,
    };
    siblings.set(leaf.key, leaf);
  }

  return sorted(root.values());
};

export const classifierQualifiers = (
  rules: readonly ClassifierRouteRuleView[],
): readonly ClassifierQualifier[] => {
  const qualifiers = new Map<string, string>();

  for (const rule of rules) {
    if (rule.mode === "selected" && rule.qualifierCode && rule.qualifierLabel) {
      qualifiers.set(rule.qualifierCode, rule.qualifierLabel);
    }
  }

  return [...qualifiers]
    .map(([code, label]) => ({ code, label }))
    .sort((left, right) => left.label.localeCompare(right.label, "ru"));
};

export const routeClassifierEntry = (input: {
  readonly entry: ClassifierRouteEntryView;
  readonly rules: readonly ClassifierRouteRuleView[];
  readonly qualifierCodes: readonly string[];
}): ClassifierRoutingSnapshot => {
  const selected = new Set(input.qualifierCodes);
  const byService = new Map<string, ClassifierRouteRuleView[]>();

  for (const rule of input.rules) {
    const group = byService.get(rule.serviceCode) ?? [];
    group.push(rule);
    byService.set(rule.serviceCode, group);
  }

  const requiredServices = [...byService.entries()]
    .flatMap(([code, rules]) => {
      const selectedRules = rules.filter(
        (rule) =>
          rule.mode === "selected" &&
          rule.qualifierCode !== null &&
          selected.has(rule.qualifierCode),
      );
      const eligible = rules.filter(
        (rule) =>
          rule.mode === "always" ||
          selectedRules.includes(rule) ||
          (rule.mode === "default" && selectedRules.length === 0),
      );

      if (eligible.length === 0) return [];

      const routeLabels = [
        ...new Set(eligible.map((rule) => rule.routeLabel.trim())),
      ];
      const first = eligible.reduce((current, rule) =>
        rule.orderIndex < current.orderIndex ? rule : current,
      );

      return [
        {
          code,
          name: first.serviceName,
          routeLabel: routeLabels.join("; "),
          orderIndex: first.orderIndex,
        },
      ];
    })
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map(({ orderIndex: _orderIndex, ...service }) => service);

  return {
    classifierVersionId: input.entry.versionId,
    classifierEntryId: input.entry.id,
    sourceCode: input.entry.sourceCode,
    featurePath: [
      input.entry.feature1,
      input.entry.feature2,
      input.entry.feature3,
    ].filter((value): value is string => value !== null),
    finalType: input.entry.finalType,
    ekpType: input.entry.ekpType,
    mainServiceCode: input.entry.mainServiceCode,
    qualifierCodes: [...selected].sort(),
    requiredServices,
  };
};
