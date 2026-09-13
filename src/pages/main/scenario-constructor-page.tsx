import {
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Grid,
  Spinner,
  Text,
  toast,
} from "@bolid-ui/themes";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";

import {
  BRIEF_MIN_LENGTH,
  ScenarioAiHelper,
  SupportIcon,
} from "../../components/scenario-authoring/scenario-ai-helper";
import { ScenarioFormSkeleton } from "../../components/scenario-authoring/scenario-form-skeleton";
import {
  ScenarioBasicsSection,
  ScenarioCallSection,
  ScenarioLocationSection,
  ScenarioPersonaSection,
} from "../../components/scenario-authoring/scenario-overview-sections";
import type { ScenarioCoordinates } from "../../components/scenario-authoring/scenario-location-values";
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
  const { draft, publication, reverseGeocoding } = useScenarioAuthoring();
  const [scenario, setScenario] = useState(createEmptyScenario);
  const [brief, setBrief] = useState("");
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperError, setHelperError] = useState<string>();
  const [authoringSource, setAuthoringSource] =
    useState<ScenarioAuthoringSource>("manual");
  const [authoringPrompt, setAuthoringPrompt] = useState<string>();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [published, setPublished] = useState<PublishedScenario>();
  const [geocodingFeedback, setGeocodingFeedback] = useState<{
    status: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ status: "idle" });
  const feedbackRef = useRef<HTMLDivElement>(null);
  const geocodingRequestRef = useRef(0);

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

  const determineAddress = async (coordinates: ScenarioCoordinates) => {
    const requestId = ++geocodingRequestRef.current;
    setGeocodingFeedback({ status: "loading" });
    setPublished(undefined);
    setValidationErrors([]);
    setScenario((current) => ({
      ...current,
      location: {
        ...current.location,
        exactAddress: {
          ...current.location.exactAddress,
          city: "",
          street: "",
          house: "",
        },
      },
    }));

    try {
      const address = await reverseGeocoding.mutateAsync({
        latitude: coordinates[0],
        longitude: coordinates[1],
      });
      if (requestId !== geocodingRequestRef.current) return;

      setScenario((current) => ({
        ...current,
        location: {
          ...current.location,
          exactAddress: {
            ...current.location.exactAddress,
            city: address.city ?? "",
            street: address.street ?? "",
            house: address.house ?? "",
          },
        },
      }));
      setGeocodingFeedback({
        status: "success",
        message: address.displayName,
      });
    } catch (error) {
      if (requestId !== geocodingRequestRef.current) return;
      setGeocodingFeedback({ status: "error", message: messageFrom(error) });
    }
  };

  // Панель закрывается сразу после отправки: пока черновик собирается, форма
  // показывает скелетон. Ошибку показываем в самой панели — она открывается
  // снова вместе с набранным описанием, чтобы его можно было поправить.
  const generate = async () => {
    const normalizedBrief = brief.trim();
    if (normalizedBrief.length < BRIEF_MIN_LENGTH) {
      setHelperError(
        `Описание для помощника должно содержать не менее ${BRIEF_MIN_LENGTH} символов.`,
      );
      return;
    }

    setHelperError(undefined);
    setValidationErrors([]);
    setPublished(undefined);
    setHelperOpen(false);

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
      setHelperError(messageFrom(error));
      setHelperOpen(true);
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
    geocodingRequestRef.current += 1;
    reverseGeocoding.reset();
    setScenario(createEmptyScenario());
    setAuthoringSource("manual");
    setAuthoringPrompt(undefined);
    setPublished(undefined);
    setValidationErrors([]);
    setGeocodingFeedback({ status: "idle" });
  };

  const busy = draft.isPending || publication.isPending;

  return (
    <Box p="4" className="min-h-full">
      <Grid
        ref={feedbackRef}
        gap="4"
        className="min-w-0 scroll-mt-4 content-start"
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
            <div>
              <Text as="div" size="2" weight="bold" mb="1">
                Сценарий требует исправлений
              </Text>
              <ul className="list-disc space-y-1 pl-4">
                {validationErrors.map((error, index) => (
                  <li key={`${index}-${error}`}>
                    <Text size="2">{error}</Text>
                  </li>
                ))}
              </ul>
            </div>
          </Callout.Root>
        )}

        {draft.isPending ? (
          <ScenarioFormSkeleton />
        ) : (
          <>
            <ScenarioBasicsSection
              scenario={scenario}
              onChange={updateScenario}
            />
            <ScenarioPersonaSection
              scenario={scenario}
              onChange={updateScenario}
            />
            <ScenarioCallSection
              scenario={scenario}
              onChange={updateScenario}
            />
            <ScenarioLocationSection
              scenario={scenario}
              onChange={updateScenario}
              onIncidentPointSelected={(coordinates) =>
                void determineAddress(coordinates)
              }
              geocodingStatus={geocodingFeedback.status}
              geocodingMessage={geocodingFeedback.message}
            />
            <ScenarioFactsSection
              scenario={scenario}
              onChange={updateScenario}
            />
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
          </>
        )}
      </Grid>

      {/*
       * Шапки в макете нет, а без действий форму не опубликовать: кнопки
       * плавают над формой в правом нижнем углу и всегда под рукой, сколько бы
       * ни было фактов и правил.
       *
       * Отступ снизу у sticky — зазор до края окна; без него панель липла
       * вплотную к нижней кромке. Обёртка прозрачна для кликов, чтобы пустое
       * место слева от панели не перекрывало поля под ней.
       *
       * Фон панели сплошной: панели темы по умолчанию полупрозрачные, и поля
       * формы просвечивали бы сквозь кнопки.
       */}
      <Flex
        justify="end"
        className="pointer-events-none sticky bottom-4 z-10 mt-4"
      >
        <Card
          size="1"
          variant="classic"
          className="shadow-5 pointer-events-auto [--card-background-color:var(--color-panel-solid)]"
        >
          <Flex align="center" gap="2" wrap="wrap">
            <Button
              type="button"
              size="2"
              variant="soft"
              onClick={() => setHelperOpen(true)}
            >
              <SupportIcon width={18} height={18} />
              Помощь ИИ
            </Button>
            <Button
              type="button"
              size="2"
              variant="soft"
              color="gray"
              disabled={busy}
              onClick={resetManual}
            >
              <RotateCcw size={16} /> Очистить
            </Button>
            <Button
              type="button"
              size="2"
              disabled={busy || Boolean(published)}
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
        </Card>
      </Flex>

      <ScenarioAiHelper
        open={helperOpen}
        onOpenChange={setHelperOpen}
        brief={brief}
        onBriefChange={(next) => {
          setBrief(next);
          setHelperError(undefined);
        }}
        pending={draft.isPending}
        error={helperError}
        onGenerate={() => void generate()}
      />
    </Box>
  );
}
