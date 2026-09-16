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
