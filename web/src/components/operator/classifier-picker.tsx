import {
  Badge,
  Button,
  Callout,
  Flex,
  Select,
  Spinner,
  Text,
} from "@bolid-ui/themes";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ClassifierRouting,
  ClassifierTreeNode,
} from "../../contracts/classifier";
import {
  INCIDENT_TYPE_OPTIONS,
  type IncidentCardPatch,
} from "../../contracts/incident";
import {
  useActiveClassifierTree,
  useClassifierRoute,
} from "../../hooks/use-classifier";
import {
  classifierNodeAtPath,
  findClassifierPath,
  searchClassifierLeaves,
} from "../../services/classifier-tree";
import { FormField } from "../auth/form-field";

interface ClassifierPickerProps {
  entryId: string | null;
  qualifierCodes: readonly string[];
  routing: ClassifierRouting | null;
  incidentType: string | null;
  disabled: boolean;
  onChange?: (patch: IncidentCardPatch) => void;
}

const sameCodes = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((code) => right.includes(code));

export function ClassifierPicker({
  entryId,
  qualifierCodes,
  routing,
  incidentType,
  disabled,
  onChange,
}: ClassifierPickerProps) {
  const treeQuery = useActiveClassifierTree();
  const [pathKeys, setPathKeys] = useState<readonly string[]>([]);
  const [search, setSearch] = useState("");
  const syncedEntryId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!treeQuery.data || syncedEntryId.current === entryId) return;

    syncedEntryId.current = entryId;
    setPathKeys(
      entryId
        ? (findClassifierPath(treeQuery.data.tree, entryId)?.map(
            (node) => node.key,
          ) ?? [])
        : [],
    );
  }, [entryId, treeQuery.data]);

  const levels = useMemo(
    () => buildLevels(treeQuery.data?.tree ?? [], pathKeys),
    [pathKeys, treeQuery.data?.tree],
  );
  const matches = useMemo(
    () => searchClassifierLeaves(treeQuery.data?.tree ?? [], search),
    [search, treeQuery.data?.tree],
  );
  const selectedNode = treeQuery.data
    ? classifierNodeAtPath(treeQuery.data.tree, pathKeys)
    : undefined;
  const selectedEntryId =
    selectedNode?.level === "leaf" ? (selectedNode.entryId ?? null) : null;
  const routeQuery = useClassifierRoute(selectedEntryId, qualifierCodes);
  const preview = routeQuery.data?.routing;
  const storedMatches =
    routing?.classifierEntryId === selectedEntryId &&
    sameCodes(routing.qualifierCodes, qualifierCodes);
  const resolvedRouting = preview ?? (storedMatches ? routing : null);

  if (treeQuery.isPending) {
    return (
      <Flex align="center" gap="2" mt="3">
        <Spinner size="1" />
        <Text size="1" color="gray">
          Загружаем классификатор…
        </Text>
      </Flex>
    );
  }

  const entryMissingFromActiveVersion =
    entryId !== null &&
    treeQuery.data !== undefined &&
    findClassifierPath(treeQuery.data.tree, entryId) === undefined;

  if (
    routing &&
    routing.classifierEntryId === entryId &&
    (treeQuery.error || entryMissingFromActiveVersion)
  ) {
    return (
      <div className="mt-3 grid gap-2">
        <Callout.Root color="blue" size="1">
          <Callout.Text>
            Карточка сохраняет тип из версии, выбранной ранее. Новая активная
            версия не изменяет уже начатый звонок.
          </Callout.Text>
        </Callout.Root>
        <RoutingSummary routing={routing} />
        {treeQuery.data && (
          <Button
            type="button"
            size="1"
            variant="soft"
            color="gray"
            disabled={disabled}
            onClick={() => {
              syncedEntryId.current = null;
              setPathKeys([]);
              onChange?.({
                classifierEntryId: null,
                classifierQualifierCodes: [],
                incidentType: null,
              });
            }}
          >
            Выбрать по текущей версии
          </Button>
        )}
      </div>
    );
  }

  if (treeQuery.error && !routing) {
    return (
      <div className="mt-3 grid gap-2">
        <Callout.Root color="amber" size="1">
          <Callout.Icon>
            <AlertTriangle size={15} />
          </Callout.Icon>
          <Callout.Text>
            Классификатор недоступен. Тип можно временно выбрать вручную.
          </Callout.Text>
        </Callout.Root>
        <ManualIncidentType
          value={incidentType}
          disabled={disabled}
          onChange={(value) =>
            onChange?.({
              classifierEntryId: null,
              classifierQualifierCodes: [],
              incidentType: value,
            })
          }
        />
      </div>
    );
  }

  const reset = () => {
    syncedEntryId.current = null;
    setPathKeys([]);
    setSearch("");
    onChange?.({
      classifierEntryId: null,
      classifierQualifierCodes: [],
      incidentType: null,
    });
  };
  const choose = (node: ClassifierTreeNode, nextPath: readonly string[]) => {
    setPathKeys(nextPath);

    if (node.level === "leaf" && node.entryId) {
      syncedEntryId.current = node.entryId;
      setSearch("");
      onChange?.({
        classifierEntryId: node.entryId,
        classifierQualifierCodes: [],
        incidentType: node.label,
      });
    }
  };

  return (
    <div className="arm112-classifier">
      <label className="arm112-type-search" htmlFor="classifier-search">
        <span>Введите тип происшествия</span>
        <input
          id="classifier-search"
          type="search"
          autoComplete="off"
          placeholder="что случилось?"
          value={search}
          disabled={disabled}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      {matches.length > 0 && (
        <ul className="arm112-type-matches">
          {matches.map(({ node, path }) => (
            <li key={node.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  choose(
                    node,
                    path.map((step) => step.key),
                  )
                }
              >
                <strong>{node.label}</strong>
                <span>{path.map(({ label }) => label).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Заголовок выбранного происшествия: в АРМ он тёмный и закрывается
          крестиком, который снимает и тип, и все его признаки. */}
      {selectedNode && (
        <div className="arm112-q-head">
          <strong>{resolvedRouting?.finalType ?? selectedNode.label}</strong>
          <button
            type="button"
            aria-label="Снять тип происшествия"
            disabled={disabled}
            onClick={reset}
          >
            <RotateCcw size={15} aria-hidden />
          </button>
        </div>
      )}

      {levels.map((level, index) => (
        <div className="arm112-q-row" key={`${index}:${level.options[0]?.key ?? "empty"}`}>
          <span className="arm112-q-label">
            {levelLabel(index, level.options)}
          </span>
          <div className="arm112-q-chips">
            {level.options.map((node) => (
              <button
                key={node.key}
                type="button"
                className="arm112-chip"
                aria-pressed={pathKeys[index] === node.key}
                disabled={disabled}
                onClick={() => choose(node, [...pathKeys.slice(0, index), node.key])}
              >
                {node.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {routeQuery.isFetching && selectedEntryId && (
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="1" color="gray">
            Определяем тип и службы…
          </Text>
        </Flex>
      )}

      {routeQuery.error && selectedEntryId && (
        <Callout.Root color="red" size="1" role="alert">
          <Callout.Icon>
            <AlertTriangle size={15} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось рассчитать маршрут. Выберите тип повторно или повторите
            позже.
          </Callout.Text>
        </Callout.Root>
      )}

      {routeQuery.data && routeQuery.data.availableQualifiers.length > 0 && (
        <div className="arm112-q-row">
          <span className="arm112-q-label">Дополнительные признаки</span>
          <div className="arm112-q-chips">
            {routeQuery.data.availableQualifiers.map((qualifier) => {
              const picked = qualifierCodes.includes(qualifier.code);

              return (
                <button
                  key={qualifier.code}
                  type="button"
                  className="arm112-chip"
                  aria-pressed={picked}
                  disabled={disabled}
                  onClick={() =>
                    onChange?.({
                      classifierEntryId: selectedEntryId,
                      classifierQualifierCodes: picked
                        ? qualifierCodes.filter(
                            (code) => code !== qualifier.code,
                          )
                        : [...qualifierCodes, qualifier.code],
                    })
                  }
                >
                  {qualifier.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {resolvedRouting && <RoutingSummary routing={resolvedRouting} />}
    </div>
  );
}

function RoutingSummary({ routing }: { routing: ClassifierRouting }) {
  return (
    <div className="arm-routing-summary border p-3">
      <Flex align="center" gap="2" wrap="wrap">
        <Text size="2" weight="bold">
          {routing.finalType}
        </Text>
        {routing.ekpType && (
          <Badge color="blue" variant="soft">
            {routing.ekpType}
          </Badge>
        )}
      </Flex>
      <Text as="div" size="1" color="gray" mt="1">
        Службы определяются сервером по выбранным признакам.
      </Text>
    </div>
  );
}

function buildLevels(
  root: readonly ClassifierTreeNode[],
  keys: readonly string[],
): readonly { options: readonly ClassifierTreeNode[] }[] {
  const levels: { options: readonly ClassifierTreeNode[] }[] = [];
  let siblings = root;

  for (let index = 0; siblings.length > 0 && index < 8; index += 1) {
    levels.push({ options: siblings });
    const selected = siblings.find((node) => node.key === keys[index]);
    if (!selected || selected.level === "leaf") break;
    siblings = selected.children;
  }

  return levels;
}

const levelLabel = (
  index: number,
  options: readonly ClassifierTreeNode[],
): string => {
  if (index === 0) return "Раздел";
  if (options.every((node) => node.level === "leaf")) return "Итоговый тип";
  return `Признак ${index}`;
};

function ManualIncidentType({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label="Тип происшествия" htmlFor="incidentTypeFallback">
      <Select.Root
        size="1"
        value={value ?? ""}
        onValueChange={onChange}
        disabled={disabled}
      >
        <Select.Trigger
          id="incidentTypeFallback"
          className="w-full"
          placeholder="Выберите тип"
        />
        <Select.Content>
          {INCIDENT_TYPE_OPTIONS.map((type) => (
            <Select.Item key={type} value={type}>
              {type}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </FormField>
  );
}
