import { describe, expect, test } from "bun:test";

import type { ClassifierTreeNode } from "../src/contracts/classifier";
import { searchClassifierLeaves } from "../src/services/classifier-tree";

const leaf = (key: string, label: string): ClassifierTreeNode => ({
  key,
  label,
  level: "leaf",
  children: [],
  entryId: `00000000-0000-4000-8000-00000000000${key}`,
});

const tree: ClassifierTreeNode[] = [
  {
    key: "1",
    label: "Пожар",
    level: "group",
    children: [leaf("2", "Транспорт"), leaf("3", "Жилой дом")],
  },
  {
    key: "4",
    label: "ДТП",
    level: "group",
    children: [leaf("5", "С пострадавшими")],
  },
];

describe("searchClassifierLeaves", () => {
  test("находит лист по словам из его ветки", () => {
    const [match] = searchClassifierLeaves(tree, "пожар транспорт");

    expect(match?.node.label).toBe("Транспорт");
    expect(match?.path.map(({ label }) => label)).toEqual([
      "Пожар",
      "Транспорт",
    ]);
  });

  test("не путает ветки между собой", () => {
    expect(searchClassifierLeaves(tree, "дтп транспорт")).toEqual([]);
  });

  test("ищет без учёта регистра и порядка слов", () => {
    expect(searchClassifierLeaves(tree, "ДОМ жилой")).toHaveLength(1);
  });

  test("пустой запрос ничего не предлагает", () => {
    expect(searchClassifierLeaves(tree, "   ")).toEqual([]);
  });

  test("не отдаёт больше, чем просили", () => {
    expect(searchClassifierLeaves(tree, "о", 1)).toHaveLength(1);
  });
});
