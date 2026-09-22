import {
  Badge,
  Button,
  Callout,
  ScrollArea,
  Skeleton,
  Text,
} from "@bolid-ui/themes";
import {
  Activity,
  AlertTriangle,
  Award,
  FileText,
  Pencil,
  PhoneIncoming,
  Plus,
  Trash2,
  User,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { ScenarioSummary } from "../../contracts/call";
import type { EditableScenarioVersion } from "../../contracts/scenario-authoring";
import { criticalQuestionsLabel } from "./scenario-catalog-formatters";
import { CategoryChip, CodeChip } from "./scenario-catalog-chips";

interface ScenarioBriefingPanelProps {
  /** Что уже известно из каталога: заголовок виден, пока грузится версия. */
  summary: ScenarioSummary;
  version?: EditableScenarioVersion;
  isPending: boolean;
  error: Error | null;
  onRetry: () => void;
  onCreate: () => void;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** Брифинг перед тренировкой: кто звонит и что оператор обязан выяснить. */
export function ScenarioBriefingPanel({
  summary,
  version,
  isPending,
  error,
  onRetry,
  onCreate,
  onStart,
  onEdit,
  onDelete,
}: ScenarioBriefingPanelProps) {
  const scenario = version?.scenario;
  const questions = scenario?.mandatoryQuestions ?? [];
  const critical = questions.filter((question) => question.isCritical).length;

  return (
    <aside
      aria-labelledby="scenario-briefing-title"
      className="scenario-briefing-panel flex h-auto min-h-[32rem] flex-col overflow-hidden rounded-[20px] border border-(--gray-a6) bg-(--color-panel-solid) shadow-[0_18px_48px_8px_rgba(0,0,0,0.12)] sm:rounded-[24px]"
    >
      <ScrollArea
        type="auto"
        scrollbars="vertical"
        className="scenario-briefing-scroll min-h-0 flex-1"
      >
        <div className="grid content-start gap-5 p-4 sm:p-6 xl:gap-6 xl:p-8">
          <header className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.06em] text-(--gray-11) uppercase">
                <FileText size={14} aria-hidden />
                Брифинг перед тренировкой
              </span>
              <Badge color="gray" variant="soft" className="tabular-nums">
                Версия {summary.version}
              </Badge>
            </div>
            <Text
              as="p"
              id="scenario-briefing-title"
              size="6"
              weight="bold"
              className="text-balance"
            >
              {summary.title}
            </Text>
            <div className="flex flex-wrap items-center gap-2">
              <CodeChip code={summary.code} />
              <CategoryChip category={summary.category} />
            </div>
            <Text as="p" size="2" color="gray" className="leading-normal">
              {summary.summary}
            </Text>
          </header>

          {version && version.issues.length > 0 && (
            <Callout.Root color="amber" size="1" role="status">
              <Callout.Icon>
                <AlertTriangle size={16} />
              </Callout.Icon>
              <Callout.Text>
                Версия опубликована по прежним правилам и сейчас не проходит
                проверку ({version.issues.length}). Откройте её на правку, чтобы
                исправить.
              </Callout.Text>
            </Callout.Root>
          )}

          {error && !version ? (
            <Callout.Root color="red" role="alert">
              <Callout.Icon>
                <AlertTriangle size={16} />
              </Callout.Icon>
              <Callout.Text>
                Не удалось загрузить сценарий: {error.message}{" "}
                <Button size="1" variant="soft" color="red" onClick={onRetry}>
                  Повторить
                </Button>
              </Callout.Text>
            </Callout.Root>
          ) : (
            <>
              <section className="grid gap-3" aria-label="Профиль вызова">
                <SectionLabel>Профиль вызова</SectionLabel>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <ProfileWidget
                    icon={User}
                    label="Заявитель"
                    value={scenario?.persona.displayName}
                    pending={isPending}
                  />
                  <ProfileWidget
                    icon={Activity}
                    label="Состояние"
                    value={scenario?.persona.condition}
                    pending={isPending}
                  />
                  <ProfileWidget
                    icon={Volume2}
                    label="Фоновые звуки"
                    value={
                      scenario
                        ? scenario.persona.backgroundSounds || "Без фона"
                        : undefined
                    }
                    pending={isPending}
                  />
                  <ProfileWidget
                    icon={Award}
                    label="Порог оценки"
                    value={
                      scenario
                        ? `${scenario.version.passThreshold} из 100`
                        : undefined
                    }
                    pending={isPending}
                  />
                </div>
              </section>

              <section className="grid gap-3" aria-label="Обязательные вопросы">
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel>
                    Обязательные вопросы
                    {scenario ? ` (${questions.length})` : ""}
                  </SectionLabel>
                  {scenario && critical > 0 && (
                    <Text size="1" weight="bold" color="red">
                      {criticalQuestionsLabel(critical)}
                    </Text>
                  )}
                </div>
                {isPending ? (
                  <div className="grid gap-2">
                    {[0, 1, 2, 3].map((index) => (
                      <Skeleton key={index} height="46px" />
                    ))}
                  </div>
                ) : questions.length === 0 ? (
                  <Text size="2" color="gray">
                    Чек-лист у сценария не задан.
                  </Text>
                ) : (
                  <ol className="grid gap-2">
                    {questions.map((question, index) => (
                      <li
                        key={`${index}-${question.text}`}
                        className="flex items-center gap-3 rounded-[8px] bg-(--gray-a2) px-4 py-3"
                      >
                        <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-(--gray-a3) text-[11px] font-bold text-(--gray-11) tabular-nums">
                          {index + 1}
                        </span>
                        <Text
                          as="p"
                          size="2"
                          color="gray"
                          className="min-w-0 flex-1 leading-[1.4]"
                        >
                          {question.text}
                        </Text>
                        {question.isCritical && (
                          <Badge color="red" variant="soft" size="1">
                            критичный
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
      </ScrollArea>

      <footer className="scenario-briefing-actions grid gap-2 border-t border-(--gray-a5) bg-(--gray-a2) p-4 sm:p-6">
        <Button
          size="3"
          radius="full"
          className="scenario-briefing-start w-full"
          onClick={onStart}
        >
          <PhoneIncoming size={16} />
          Начать тренировку
        </Button>
        <Button
          size="3"
          radius="full"
          variant="soft"
          color="gray"
          onClick={onCreate}
        >
          <Plus size={16} />
          Создать
        </Button>
        <Button
          size="3"
          radius="full"
          variant="soft"
          color="gray"
          disabled={!version}
          onClick={onEdit}
        >
          <Pencil size={16} />
          Редактировать
        </Button>
        {/* Удаление нуждается в идентификаторе сценария, а он приходит вместе
            с версией: до её загрузки кнопка недоступна. */}
        <Button
          size="3"
          radius="full"
          variant="soft"
          color="red"
          disabled={!version}
          onClick={onDelete}
        >
          <Trash2 size={16} />
          Удалить
        </Button>
      </footer>
    </aside>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold tracking-[0.06em] text-(--gray-11) uppercase">
      {children}
    </span>
  );
}

function ProfileWidget({
  icon: Icon,
  label,
  value,
  pending,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  pending: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3.5 rounded-[12px] bg-(--gray-a2) p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-(--gray-a3) text-(--gray-11)">
        <Icon size={18} aria-hidden />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-[11px] tracking-[0.04em] text-(--gray-11) uppercase">
          {label}
        </span>
        {pending || value === undefined ? (
          <Skeleton height="18px" width="80%" />
        ) : (
          <Text as="p" size="2" weight="bold" className="break-words">
            {value}
          </Text>
        )}
      </div>
    </div>
  );
}
