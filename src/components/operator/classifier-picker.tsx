import {
  Badge,
  Button,
  Callout,
  Checkbox,
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

  return (
    <div className="mt-3 grid gap-3">
      <Flex align="center" justify="between" gap="2">
        <div>
          <Text size="1" color="gray">
            Классификатор происшествий
          </Text>
          {treeQuery.data && (
            <Text as="div" size="1" color="gray">
              Версия {treeQuery.data.version.version}
            </Text>
          )}
        </div>
        {entryId && (
          <Button
            type="button"
            size="1"
            variant="ghost"
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
            <RotateCcw size={13} /> Сбросить
          </Button>
        )}
      </Flex>

      {levels.map((level, index) => (
        <FormField
          key={`${index}:${level.options[0]?.key ?? "empty"}`}
          label={levelLabel(index, level.options)}
          htmlFor={`classifier-level-${index}`}
        >
          <Select.Root
            size="1"
            value={pathKeys[index] ?? ""}
            disabled={disabled}
            onValueChange={(key) => {
              const node = level.options.find((option) => option.key === key);
              if (!node) return;

              const nextPath = [...pathKeys.slice(0, index), key];
              setPathKeys(nextPath);

              if (node.level === "leaf" && node.entryId) {
                syncedEntryId.current = node.entryId;
                onChange?.({
                  classifierEntryId: node.entryId,
                  classifierQualifierCodes: [],
                  incidentType: node.label,
                });
              }
            }}
          >
            <Select.Trigger
              id={`classifier-level-${index}`}
              className="w-full"
              placeholder="Выберите значение"
            />
            <Select.Content>
              {level.options.map((node) => (
                <Select.Item key={node.key} value={node.key}>
                  {node.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </FormField>
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
        <div className="grid gap-1.5">
          <Text size="1" color="gray">
            Дополнительные признаки
          </Text>
          {routeQuery.data.availableQualifiers.map((qualifier) => (
            <Text as="label" size="1" key={qualifier.code}>
              <Flex align="center" gap="2">
                <Checkbox
                  size="1"
                  checked={qualifierCodes.includes(qualifier.code)}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    const next =
                      checked === true
                        ? [...qualifierCodes, qualifier.code]
                        : qualifierCodes.filter(
                            (code) => code !== qualifier.code,
                          );
                    onChange?.({
                      classifierEntryId: selectedEntryId,
                      classifierQualifierCodes: next,
                    });
                  }}
                />
                {qualifier.label}
              </Flex>
            </Text>
          ))}
        </div>
      )}

      {resolvedRouting && <RoutingSummary routing={resolvedRouting} />}
    </div>
  );
}

function RoutingSummary({ routing }: { routing: ClassifierRouting }) {
  return (
    <div className="rounded-(--radius-2) border border-(--gray-a5) bg-(--gray-a2) p-3">
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
