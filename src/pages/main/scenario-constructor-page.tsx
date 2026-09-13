import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Spinner,
  Text,
  TextArea,
  toast,
} from "@bolid-ui/themes";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  FilePlus2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";

import {
  ScenarioBasicsSection,
  ScenarioCallSection,
  ScenarioLocationSection,
  ScenarioPersonaSection,
} from "../../components/scenario-authoring/scenario-overview-sections";
import {
  ScenarioEscalationSection,
  ScenarioFactsSection,
  ScenarioQuestionsSection,
  ScenarioReferenceSection,
} from "../../components/scenario-authoring/scenario-rules-sections";
import {
  createEmptyScenario,
  mergeScenarioAssistantDraft,
  ScenarioSeedSchema,
  type PublishedScenario,
  type ScenarioSeed,
} from "../../contracts/scenario-authoring";
import { useScenarioAuthoring } from "../../hooks/use-scenario-authoring";
import { ApiError } from "../../lib/api";
import type { ScenarioAuthoringSource } from "../../services/scenario-authoring.service";

const messageFrom = (error: unknown): string =>
  error instanceof ApiError || error instanceof Error
    ? error.message
    : "Не удалось выполнить запрос";

const FIELD_LABELS: Record<string, string> = {
  code: "Код сценария",
  title: "Название",
  summary: "Краткое описание",
  "persona.code": "Код персоны",
  "persona.displayName": "Имя заявителя",
  "persona.condition": "Состояние заявителя",
  "persona.speechStyle": "Манера речи",
  "persona.voiceId": "Голос TTS",
  "version.openingLine": "Первая реплика",
  "version.fallbackLine": "Запасная реплика",
  "location.exactPoint": "Точка происшествия",
  "location.locatorCenter": "Область геолокации",
  "location.locatorLabel": "Подпись области геолокации",
};

const formatIssue = (issue: {
  code: string;
  path: PropertyKey[];
  message: string;
}): string => {
  const rawPath = issue.path.map(String).join(".");
  const factMatch = /^facts\.(\d+)\.(.+)$/.exec(rawPath);
  const questionMatch = /^mandatoryQuestions\.(\d+)\.(.+)$/.exec(rawPath);
  const label =
    FIELD_LABELS[rawPath] ??
    (factMatch
      ? `Факт ${Number(factMatch[1]) + 1} · ${factMatch[2]}`
      : questionMatch
        ? `Вопрос ${Number(questionMatch[1]) + 1} · ${questionMatch[2]}`
        : rawPath || "Сценарий");
  const message =
    issue.code === "too_small"
      ? "значение отсутствует или слишком короткое"
      : issue.code === "too_big"
        ? "значение превышает допустимый размер"
        : issue.code === "invalid_type"
          ? "неверный тип значения"
          : issue.message;

  return `${label}: ${message}`;
};

export default function ScenarioConstructorPage() {
  const navigate = useNavigate();
  const { draft, publication } = useScenarioAuthoring();
  const [scenario, setScenario] = useState(createEmptyScenario);
  const [brief, setBrief] = useState("");
  const [authoringSource, setAuthoringSource] =
    useState<ScenarioAuthoringSource>("manual");
  const [authoringPrompt, setAuthoringPrompt] = useState<string>();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [published, setPublished] = useState<PublishedScenario>();
  const feedbackRef = useRef<HTMLDivElement>(null);

  const revealFeedback = () =>
    requestAnimationFrame(() =>
      feedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );

  const updateScenario = (next: ScenarioSeed) => {
    setScenario(next);
    setPublished(undefined);
    setValidationErrors([]);
  };

  const generate = async () => {
    const normalizedBrief = brief.trim();
    if (normalizedBrief.length < 20) {
      setValidationErrors([
        "Описание для помощника должно содержать не менее 20 символов.",
      ]);
      return;
    }

    setValidationErrors([]);
    setPublished(undefined);

    try {
      const result = await draft.mutateAsync(normalizedBrief);
      setScenario((current) =>
        mergeScenarioAssistantDraft(current, result.scenario),
      );
      setAuthoringSource("assistant");
      setAuthoringPrompt(result.authoringPrompt);
      toast.success("Черновик заполнен", {
        description:
          "Проверьте факты, условия раскрытия и эталон перед публикацией.",
      });
    } catch (error) {
      setValidationErrors([messageFrom(error)]);
    }
  };

  const publish = async () => {
    const parsed = ScenarioSeedSchema.safeParse(scenario);
    if (!parsed.success) {
      const errors = parsed.error.issues.slice(0, 12).map(formatIssue);
      setValidationErrors(errors);
      revealFeedback();
      return;
    }

    setValidationErrors([]);

    try {
      const result = await publication.mutateAsync({
        scenario: parsed.data,
        authoringSource,
        ...(authoringPrompt ? { authoringPrompt } : {}),
      });
      setPublished(result);
      toast.success("Сценарий опубликован", {
        description: `${result.code} · версия ${result.version}`,
      });
      revealFeedback();
    } catch (error) {
      setValidationErrors([messageFrom(error)]);
      revealFeedback();
    }
  };

  const resetManual = () => {
    setScenario(createEmptyScenario());
    setAuthoringSource("manual");
    setAuthoringPrompt(undefined);
    setPublished(undefined);
    setValidationErrors([]);
  };

  return (
    <div className="bg-gray-2 min-h-full">
      <header className="border-grayA-5 bg-panel sticky top-0 z-20 border-b px-5 py-3 shadow-sm">
        <Flex align="center" justify="between" gap="4" wrap="wrap">
          <Flex align="center" gap="3" className="min-w-0">
            <Button
              type="button"
              variant="ghost"
              color="gray"
              aria-label="Назад к рабочему месту"
              onClick={() => navigate("/")}
            >
              <ArrowLeft size={17} />
            </Button>
            <div className="min-w-0">
              <Flex align="center" gap="2">
                <FilePlus2 size={19} />
                <Text size="4" weight="bold">
                  Конструктор сценария
                </Text>
                <Badge
                  color={authoringSource === "assistant" ? "violet" : "gray"}
                >
                  {authoringSource === "assistant"
                    ? "Черновик AI"
                    : "Ручной ввод"}
                </Badge>
              </Flex>
              <Text as="p" size="1" color="gray" mt="1">
                Новая публикация создаёт неизменяемую версию 1
              </Text>
            </div>
          </Flex>

          <Flex align="center" gap="2">
            <Button
              type="button"
              variant="soft"
              color="gray"
              disabled={draft.isPending || publication.isPending}
              onClick={resetManual}
            >
              <RotateCcw size={15} /> Очистить
            </Button>
            <Button
              type="button"
              color="green"
              disabled={
                draft.isPending || publication.isPending || Boolean(published)
              }
              onClick={() => void publish()}
            >
              {publication.isPending ? (
                <Spinner size="1" />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {publication.isPending
                ? "Публикуем…"
                : "Проверить и опубликовать"}
            </Button>
          </Flex>
        </Flex>
      </header>

      <div className="mx-auto grid max-w-[1680px] gap-5 p-5 min-[900px]:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="self-start min-[900px]:sticky min-[900px]:top-[88px]">
          <Card size="3" variant="classic">
            <Flex align="center" gap="2" mb="2">
              <span className="bg-violet-3 text-violet-11 grid size-9 place-items-center rounded-lg">
                <Bot size={19} />
              </span>
              <div>
                <Text as="div" size="3" weight="bold">
                  Помощник по заполнению
                </Text>
                <Text as="div" size="1" color="gray">
                  Alice AI LLM Flash
                </Text>
              </div>
            </Flex>

            <Text as="p" size="2" color="gray" mb="3">
              Опишите происшествие, заявителя, скрытые сведения и ожидаемые
              действия оператора. Адрес и область на карте задаются вручную.
            </Text>

            <label className="text-gray-11 grid gap-1 text-xs">
              Описание сценария
              <TextArea
                value={brief}
                rows={7}
                maxLength={4_000}
                placeholder="Например: учебный вызов о задымлении в мастерской. Заявитель снаружи, внутри один пострадавший…"
                onChange={(event) => setBrief(event.currentTarget.value)}
              />
            </label>
            <Flex justify="between" mt="1">
              <Text size="1" color="gray">
                Минимум 20 символов
              </Text>
              <Text size="1" color="gray" className="tabular-nums">
                {brief.length}/4000
              </Text>
            </Flex>

            <Button
              type="button"
              className="mt-3 w-full"
              color="violet"
              disabled={
                draft.isPending ||
                publication.isPending ||
                brief.trim().length < 20
              }
              onClick={() => void generate()}
            >
              {draft.isPending ? <Spinner size="1" /> : <Sparkles size={16} />}
              {draft.isPending ? "Формируем черновик…" : "Заполнить черновик"}
            </Button>

            <Callout.Root color="amber" size="1" mt="4">
              <Callout.Icon>
                <AlertTriangle size={15} />
              </Callout.Icon>
              <Callout.Text>
                Текст описания передаётся во внешний Alice AI. Используйте
                только синтетические имена и телефоны. Помощник не получает и не
                изменяет адрес или координаты и ничего не публикует.
              </Callout.Text>
            </Callout.Root>

            <div className="border-grayA-5 mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-center">
              <Stat value={scenario.facts.length} label="фактов" />
              <Stat
                value={scenario.mandatoryQuestions.length}
                label="вопросов"
              />
              <Stat
                value={scenario.referenceCard.fields.length}
                label="полей"
              />
            </div>
          </Card>
        </aside>

        <main
          ref={feedbackRef}
          className="grid min-w-0 scroll-mt-24 content-start gap-5 pb-8"
        >
          {published && (
            <Callout.Root color="green" size="2" role="status">
              <Callout.Icon>
                <CheckCircle2 size={18} />
              </Callout.Icon>
              <Callout.Text>
                <strong>{published.code}</strong> опубликован как версия{" "}
                {published.version}. Он уже доступен в списке тренировок.
              </Callout.Text>
            </Callout.Root>
          )}

          {validationErrors.length > 0 && (
            <Callout.Root color="red" size="2" role="alert">
              <Callout.Icon>
                <AlertTriangle size={18} />
              </Callout.Icon>
              <div className="text-red-11 text-sm">
                <Text as="div" size="2" weight="bold" mb="1">
                  Сценарий требует исправлений
                </Text>
                <ul className="list-disc space-y-1 pl-4">
                  {validationErrors.map((error, index) => (
                    <li key={`${index}-${error}`}>{error}</li>
                  ))}
                </ul>
              </div>
            </Callout.Root>
          )}

          <ScenarioBasicsSection
            scenario={scenario}
            onChange={updateScenario}
          />
          <ScenarioPersonaSection
            scenario={scenario}
            onChange={updateScenario}
          />
          <ScenarioCallSection scenario={scenario} onChange={updateScenario} />
          <ScenarioLocationSection
            scenario={scenario}
            onChange={updateScenario}
          />
          <ScenarioFactsSection scenario={scenario} onChange={updateScenario} />
          <ScenarioQuestionsSection
            scenario={scenario}
            onChange={updateScenario}
          />
          <ScenarioEscalationSection
            scenario={scenario}
            onChange={updateScenario}
          />
          <ScenarioReferenceSection
            scenario={scenario}
            onChange={updateScenario}
          />
        </main>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <Text as="div" size="4" weight="bold" className="tabular-nums">
        {value}
      </Text>
      <Text as="div" size="1" color="gray">
        {label}
      </Text>
    </div>
  );
}
