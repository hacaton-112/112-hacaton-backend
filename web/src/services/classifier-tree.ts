import type { ClassifierTreeNode } from "../contracts/classifier";

/** Finds the exact branch by immutable leaf id; duplicate labels remain safe. */
export function findClassifierPath(
  nodes: readonly ClassifierTreeNode[],
  entryId: string,
): readonly ClassifierTreeNode[] | undefined {
  for (const node of nodes) {
    if (node.entryId === entryId) return [node];

    const childPath = findClassifierPath(node.children, entryId);
    if (childPath) return [node, ...childPath];
  }

  return undefined;
}

export interface ClassifierLeafMatch {
  readonly node: ClassifierTreeNode;
  readonly path: readonly ClassifierTreeNode[];
}

/**
 * Ищет происшествие по названию, как поле «что случилось?» в реальном АРМ.
 *
 * Оператор слышит «горит машина» и набирает это словами, а не разворачивает
 * дерево по уровням. Совпадение ищется и по ветке: «пожар транспорт» находит
 * лист, в названии которого есть только «транспорт».
 */
export function searchClassifierLeaves(
  nodes: readonly ClassifierTreeNode[],
  query: string,
  limit = 12,
): readonly ClassifierLeafMatch[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const found: ClassifierLeafMatch[] = [];

  const walk = (siblings: readonly ClassifierTreeNode[], path: readonly ClassifierTreeNode[]) => {
    for (const node of siblings) {
      if (found.length >= limit) return;

      const branch = [...path, node];

      if (node.level === "leaf" && node.entryId) {
        const haystack = branch
          .map(({ label }) => label.toLowerCase())
          .join(" ");

        if (words.every((word) => haystack.includes(word))) {
          found.push({ node, path: branch });
        }
      }

      walk(node.children, branch);
    }
  };

  walk(nodes, []);

  return found;
}

export function classifierNodeAtPath(
  nodes: readonly ClassifierTreeNode[],
  keys: readonly string[],
): ClassifierTreeNode | undefined {
  let siblings = nodes;
  let selected: ClassifierTreeNode | undefined;

  for (const key of keys) {
    selected = siblings.find((node) => node.key === key);
    if (!selected) return undefined;
    siblings = selected.children;
  }

  return selected;
}
