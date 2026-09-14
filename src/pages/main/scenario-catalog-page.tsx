import {
  Button,
  Callout,
  Card,
  ScrollArea,
  Skeleton,
  Text,
  toast,
} from "@bolid-ui/themes";
import { AlertTriangle, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { ScenarioBriefingPanel } from "../../components/scenario-catalog/scenario-briefing-panel";
import { ScenarioCatalogCard } from "../../components/scenario-catalog/scenario-catalog-card";
import { ScenarioDeleteDialog } from "../../components/scenario-catalog/scenario-delete-dialog";
import { useScenarioAuthoring } from "../../hooks/use-scenario-authoring";
import { useScenarioVersion } from "../../hooks/use-scenario-version";
import { useScenarios } from "../../hooks/use-scenarios";

/**
 * Учебные сценарии: что опубликовано, брифинг выбранного и правка.
 *
 * Выбор живёт в адресе: после публикации правки конструктор возвращает сюда
 * уже на новую версию, и она сразу открыта в брифинге.
 */
export default function ScenarioCatalogPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const scenarios = useScenarios();
  const list = scenarios.data ?? [];
  const requested = searchParams.get("selected");
  const selected =
    list.find((scenario) => scenario.scenarioVersionId === requested) ??
    list[0];
  const version = useScenarioVersion(selected?.scenarioVersionId);
  const { archival } = useScenarioAuthoring();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const select = (scenarioVersionId: string) =>
    setSearchParams({ selected: scenarioVersionId }, { replace: true });

  const openDeleteDialog = () => {
    archival.reset();
    setDeleteOpen(true);
  };

  const deleteSelected = async () => {
    if (!selected || !version.data) return;

    try {
      await archival.mutateAsync(version.data.scenarioId);
      setDeleteOpen(false);
      // Выбор сбрасывается на первый оставшийся сценарий.
      setSearchParams({}, { replace: true });
      toast.success("Сценарий удалён", {
        description: `${selected.code} · ${selected.title}`,
      });
    } catch {
      // Причина остаётся в диалоге: преподаватель может повторить или отменить.
    }
  };

  return (
    <div className="scenario-catalog-page h-full min-h-full">
      <div className="scenario-catalog-layout grid min-h-full gap-4 p-4">
        <section
          aria-label="Учебные сценарии"
          className="flex min-h-0 min-w-0 flex-col"
        >
          {/* Упавшее фоновое обновление не прячет уже загруженный список. */}
          {scenarios.error && !scenarios.data ? (
            <Callout.Root color="red" role="alert">
              <Callout.Icon>
                <AlertTriangle size={16} />
              </Callout.Icon>
              <Callout.Text>
                Не удалось получить список сценариев: {scenarios.error.message}{" "}
                <Button
                  size="1"
                  variant="soft"
                  color="red"
                  onClick={() => void scenarios.refetch()}
                >
                  Повторить
                </Button>
              </Callout.Text>
            </Callout.Root>
          ) : (
            <ScrollArea
              type="auto"
              scrollbars="vertical"
              className="scenario-catalog-scroll -m-1 min-h-0 flex-1"
            >
              <div className="scenario-catalog-grid grid gap-4 p-1">
                {scenarios.isPending
                  ? [0, 1, 2, 3].map((index) => (
                      <Skeleton
                        key={index}
                        height="220px"
                        className="rounded-[16px]"
                      />
                    ))
                  : list.map((scenario) => (
                      <ScenarioCatalogCard
                        key={scenario.scenarioVersionId}
                        scenario={scenario}
                        selected={
                          scenario.scenarioVersionId ===
                          selected?.scenarioVersionId
                        }
                        onSelect={() => select(scenario.scenarioVersionId)}
                      />
                    ))}
              </div>
            </ScrollArea>
          )}
        </section>

        {selected ? (
          <ScenarioBriefingPanel
            summary={selected}
            version={version.data}
            isPending={version.isPending}
            error={version.error}
            onRetry={() => void version.refetch()}
            onCreate={() => navigate("/scenarios/new")}
            onStart={() =>
              navigate(
                `/?scenario=${encodeURIComponent(selected.scenarioVersionId)}`,
              )
            }
            onEdit={() =>
              navigate(
                `/scenarios/${encodeURIComponent(selected.scenarioVersionId)}/edit`,
              )
            }
            onDelete={openDeleteDialog}
          />
        ) : (
          !scenarios.isPending &&
          !(scenarios.error && !scenarios.data) && (
            <Card size="3" variant="classic" className="grid gap-4 self-start">
              <Text as="p" size="2" color="gray">
                Опубликуйте первый сценарий — здесь появится его брифинг: кто
                звонит, порог оценки и обязательные вопросы.
              </Text>
              <Button
                size="2"
                radius="full"
                className="justify-self-start"
                onClick={() => navigate("/scenarios/new")}
              >
                <Plus size={16} />
                Создать сценарий
              </Button>
            </Card>
          )
        )}
        {selected && (
          <ScenarioDeleteDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            code={selected.code}
            title={selected.title}
            pending={archival.isPending}
            error={archival.error?.message}
            onConfirm={() => void deleteSelected()}
          />
        )}
      </div>
    </div>
  );
}
