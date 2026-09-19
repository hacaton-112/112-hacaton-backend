import {
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Grid,
  Heading,
  Spinner,
  Text,
  toast,
} from "@bolid-ui/themes";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  SpellCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import {
  BRIEF_MIN_LENGTH,
  ScenarioAiHelper,
  SupportIcon,
} from "../../components/scenario-authoring/scenario-ai-helper";
import { Breadcrumbs } from "../../components/ui/breadcrumbs";
import { ScenarioAudioPreparation } from "../../components/scenario-authoring/scenario-audio-preparation";
import { DialoguePreparationPanel } from "../../components/scenario-authoring/dialogue-preparation-panel";
import {
  preparationCanPublish,
  type PreparationSelection,
} from "../../components/scenario-authoring/dialogue-preparation-state";
import {
  describeIssue,
  fieldErrorsFrom,
  isShownByField,
  ScenarioFormErrorsContext,
  ScenarioFormLoadingContext,
  withoutFieldErrors,
  type ScenarioFieldErrors,
} from "../../components/scenario-authoring/scenario-form-context";
import { ScenarioGrammarDialog } from "../../components/scenario-authoring/scenario-grammar-dialog";
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
  scenarioForEditing,
  ScenarioSeedSchema,
  type EditableScenarioVersion,
  type PublishedScenario,
  type ScenarioSeed,
} from "../../contracts/scenario-authoring";
import { useScenarioAuthoring } from "../../hooks/use-scenario-authoring";
import { useScenarioVersion } from "../../hooks/use-scenario-version";
import { ROUTES } from "../../config/routes";
import { useScenarios } from "../../hooks/use-scenarios";
import { ApiError } from "../../lib/api";
import { messageFrom } from "../../lib/error-message";
import type { ScenarioAuthoringSource } from "../../services/scenario-authoring.service";

/** Запасной текст, если ошибка пришла без сообщения. */
const REQUEST_ERROR = "Не удалось выполнить запрос";

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

type ValidationIssue = Parameters<typeof describeIssue>[0];

const formatIssue = (issue: ValidationIssue): string => {
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
  return `${label}: ${describeIssue(issue)}`;
};

/**
 * Конструктор: новый сценарий или правка опубликованной версии.
 *
 * Правка всегда рождает следующую версию — проведённые звонки остаются на
 * тех версиях, по которым они шли. Ключ по версии сбрасывает форму, когда из
 * одной правки переходят в другую.
 */
export default function ScenarioConstructorPage() {
  const { scenarioVersionId } = useParams();

  return scenarioVersionId ? (
    <ScenarioVersionEditor
      key={scenarioVersionId}
      scenarioVersionId={scenarioVersionId}
    />
  ) : (
    <ScenarioConstructor key="new" />
  );
}

function ScenarioVersionEditor({
  scenarioVersionId,
}: {
  scenarioVersionId: string;
}) {
  const navigate = useNavigate();
  const version = useScenarioVersion(scenarioVersionId);

  if (version.error) {
    return (
      <Box p="4">
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={18} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось открыть сценарий на правку:{" "}
            {messageFrom(version.error, REQUEST_ERROR)}{" "}
            <Button
              size="1"
              variant="soft"
              color="red"
              onClick={() => navigate(ROUTES.scenarios())}
            >
              К сценариям
            </Button>
          </Callout.Text>
        </Callout.Root>
      </Box>
    );
  }

  if (!version.data) {
    return (
      <Box p="4">
        <ScenarioFormSkeleton label="Загружаем опубликованную версию" />
      </Box>
    );
  }

  return <ScenarioConstructor base={version.data} />;
}

function ScenarioConstructor({ base }: { base?: EditableScenarioVersion }) {
  const navigate = useNavigate();
  const scenarios = useScenarios();
  const {
    draft,
    grammarCheck,
    publication,
    versionPublication,
    reverseGeocoding,
  } = useScenarioAuthoring();
  const [grammarOpen, setGrammarOpen] = useState(false);
  const initialScenario = () =>
    base ? scenarioForEditing(base.scenario) : createEmptyScenario();
  const [scenario, setScenario] = useState(initialScenario);
  const [staleEdit, setStaleEdit] = useState(false);
  // Версия, опубликованная по прежним правилам: расхождения видны сразу, до
  // первой попытки публикации, и не пропадают от случайной правки.
  const [outdatedIssues, setOutdatedIssues] = useState<string[]>(() =>
    (base?.issues ?? []).map((issue) =>
      formatIssue({
        code: "custom",
        path: [...issue.path],
        message: issue.message,
      }),
    ),
  );
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperError, setHelperError] = useState<string>();
  const [authoringSource, setAuthoringSource] =
    useState<ScenarioAuthoringSource>("manual");
  const [authoringPrompt, setAuthoringPrompt] = useState<string>();
  // Ошибки проверки живут у полей: подсвечены красным и подписаны под ними.
  // Расхождения версии, опубликованной по прежним правилам, видны сразу.
  const [fieldErrors, setFieldErrors] = useState<ScenarioFieldErrors>(() =>
    fieldErrorsFrom(
      (base?.issues ?? []).map((issue) => ({
        code: "custom",
        path: [...issue.path],
        message: issue.message,
      })),
    ),
  );
  const [revealRequest, setRevealRequest] = useState(0);
  const revealIssuesRef = useRef<ValidationIssue[]>([]);
  const [published, setPublished] = useState<PublishedScenario>();
  const [preparation, setPreparation] = useState<PreparationSelection | null>(
    null,
  );
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
  };

  const clearFieldError = useCallback(
    (path: string) =>
      setFieldErrors((current) => withoutFieldErrors(current, path)),
    [],
  );
  const errorsContext = useMemo(
    () => ({ errors: fieldErrors, clear: clearFieldError }),
    [fieldErrors, clearFieldError],
  );

  // После неудачной проверки поля уже отрисованы красными: прокручиваем к
  // первому из них. Ошибку, у которой в форме нет своего поля, показываем
  // уведомлением — иначе её было бы не увидеть.
  useEffect(() => {
    if (revealRequest === 0) return;

    const fieldPaths = Array.from(
      document.querySelectorAll<HTMLElement>("[data-field-path]"),
      (element) => element.dataset.fieldPath ?? "",
    );
    const unshown = revealIssuesRef.current.filter(
      (issue) => !isShownByField(issue.path.map(String).join("."), fieldPaths),
    );
    if (unshown.length > 0) {
      toast.error("Сценарий требует исправлений", {
        description: unshown.slice(0, 5).map(formatIssue).join("\n"),
        duration: 8_000,
      });
    }

    const first = document.querySelector<HTMLElement>(
      '[data-field-invalid="true"]',
    );
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    first
      ?.querySelector<HTMLElement>("input, textarea, [role='combobox']")
      ?.focus({ preventScroll: true });
  }, [revealRequest]);

  /** Открыть последнюю версию сценария: список перечитывается, он мог отстать. */
  const openLatestVersion = async () => {
    if (!base) return;

    const refreshed = await scenarios.refetch();
    const latest = refreshed.data?.find(
      (item) => item.code === base.scenario.code,
    );

    navigate(
      latest
        ? ROUTES.scenarioEdit(latest.scenarioVersionId)
        : ROUTES.scenarios(),
    );
  };

  const determineAddress = async (coordinates: ScenarioCoordinates) => {
    const requestId = ++geocodingRequestRef.current;
    setGeocodingFeedback({ status: "loading" });
    setPublished(undefined);
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
      setGeocodingFeedback({
        status: "error",
        message: messageFrom(error, REQUEST_ERROR),
      });
    }
  };

  // Панель закрывается сразу после отправки: пока черновик собирается, форма
  // показывает скелетон. Ошибку показываем в самой панели — она открывается
  // снова вместе с набранным описанием, чтобы его можно было поправить.
  const generate = async (brief: string) => {
    const normalizedBrief = brief.trim();
    if (normalizedBrief.length < BRIEF_MIN_LENGTH) {
      setHelperError(
        `Описание для помощника должно содержать не менее ${BRIEF_MIN_LENGTH} символов.`,
      );
      return;
    }

    setHelperError(undefined);
    setFieldErrors(new Map());
    setPublished(undefined);
    setHelperOpen(false);

    try {
      const result = await draft.mutateAsync(normalizedBrief);
      setScenario((current) =>
        mergeScenarioAssistantDraft(current, result.scenario, {
          keepIdentity: Boolean(base),
        }),
      );
      setAuthoringSource("assistant");
      setAuthoringPrompt(result.authoringPrompt);
      toast.success("Черновик заполнен", {
        description:
          "Проверьте факты, условия раскрытия и эталон перед публикацией.",
      });
    } catch (error) {
      setHelperError(messageFrom(error, REQUEST_ERROR));
      setHelperOpen(true);
    }
  };

  const publish = async () => {
    if (!preparationCanPublish(preparation, scenario)) {
      toast.error(
        "Сначала завершите подготовку текущего снимка или продолжите без этого набора",
      );
      return;
    }
    const parsed = ScenarioSeedSchema.safeParse(scenario);
    if (!parsed.success) {
      revealIssuesRef.current = parsed.error.issues;
      setFieldErrors(fieldErrorsFrom(parsed.error.issues));
      setRevealRequest((request) => request + 1);
      return;
    }

    setFieldErrors(new Map());
    setStaleEdit(false);

    try {
      if (base) {
        const result = await versionPublication.mutateAsync({
          ...(preparation?.id ? { preparationId: preparation.id } : {}),
          scenarioId: base.scenarioId,
          baseVersionId: base.scenarioVersionId,
          scenario: parsed.data,
          authoringSource,
          ...(authoringPrompt ? { authoringPrompt } : {}),
        });
        setOutdatedIssues([]);
        toast.success("Опубликована новая версия", {
          description: `${result.code} · версия ${result.version}`,
        });
        navigate(
          `/scenarios?selected=${encodeURIComponent(result.scenarioVersionId)}`,
        );
        return;
      }

      const result = await publication.mutateAsync({
        ...(preparation?.id ? { preparationId: preparation.id } : {}),
        scenario: parsed.data,
        authoringSource,
        ...(authoringPrompt ? { authoringPrompt } : {}),
      });
      setPublished(result);
      setPreparation(null);
      toast.success("Сценарий опубликован", {
        description: `${result.code} · версия ${result.version}`,
      });
      revealFeedback();
    } catch (error) {
      // Устаревшая правка — не ошибка ввода: её нельзя исправить в форме, и
      // объяснять её нужно отдельно.
      if (
        error instanceof ApiError &&
        error.code === "SCENARIO_VERSION_STALE"
      ) {
        setStaleEdit(true);
        revealFeedback();
      } else {
        toast.error("Сценарий не опубликован", {
          description: messageFrom(error, REQUEST_ERROR),
          duration: 8_000,
        });
      }
    }
  };

  const resetManual = () => {
    geocodingRequestRef.current += 1;
    reverseGeocoding.reset();
    setScenario(initialScenario());
    setStaleEdit(false);
    setAuthoringSource("manual");
    setAuthoringPrompt(undefined);
    setPublished(undefined);
    setFieldErrors(new Map());
    setGeocodingFeedback({ status: "idle" });
  };

  const publishing = publication.isPending || versionPublication.isPending;
  const busy = draft.isPending || publishing;

  return (
    <Box p="4" className="min-h-full">
      <Breadcrumbs
        className="mb-4"
        items={[
          { label: "Каталог сценариев", to: ROUTES.scenarios() },
          {
            label: base
              ? `${base.scenario.code} · Редактирование версии ${base.version}`
              : "Новый сценарий",
          },
        ]}
      />
      <Grid
        ref={feedbackRef}
        gap="4"
        className="min-w-0 scroll-mt-4 content-start"
      >
        {base && (
          <Card size="2" variant="classic">
            <Flex align="start" justify="between" gap="3" wrap="wrap">
              <Grid gap="1" className="min-w-0">
                <Text size="1" color="gray">
                  Правка опубликованного сценария
                </Text>
                <Heading as="h1" size="4" weight="bold">
                  {base.scenario.code} · {base.scenario.title}
                </Heading>
                <Text size="2" color="gray">
                  Основа — версия {base.version}. Публикация создаст версию{" "}
                  {base.version + 1}, а проведённые звонки останутся на своих
                  версиях.
                </Text>
              </Grid>
              <Button
                type="button"
                size="2"
                variant="soft"
                color="gray"
                onClick={() =>
                  navigate(
                    `/scenarios?selected=${encodeURIComponent(base.scenarioVersionId)}`,
                  )
                }
              >
                <ArrowLeft size={16} /> К сценариям
              </Button>
            </Flex>
            {!base.isLatest && (
              <Callout.Root color="amber" size="1" mt="3">
                <Callout.Icon>
                  <AlertTriangle size={16} />
                </Callout.Icon>
                <Callout.Text>
                  Это не последняя версия сценария, и её правку backend не
                  примет. Откройте актуальную версию.{" "}
                  <Button
                    type="button"
                    size="1"
                    variant="soft"
                    color="amber"
                    onClick={() => void openLatestVersion()}
                  >
                    Открыть актуальную
                  </Button>
                </Callout.Text>
              </Callout.Root>
            )}
          </Card>
        )}

        {outdatedIssues.length > 0 && (
          <Callout.Root color="amber" size="2" role="status">
            <Callout.Icon>
              <AlertTriangle size={18} />
            </Callout.Icon>
            <div>
              <Text as="div" size="2" weight="bold" mb="1">
                Версия не проходит сегодняшние правила сценария
              </Text>
              <Text as="p" size="2" mb="1">
                Её опубликовали до того, как правила стали строже. Исправьте
                расхождения — иначе новую версию опубликовать не получится.
              </Text>
              <ul className="list-disc space-y-1 pl-4">
                {outdatedIssues.map((issue, index) => (
                  <li key={`${index}-${issue}`}>
                    <Text size="2">{issue}</Text>
                  </li>
                ))}
              </ul>
            </div>
          </Callout.Root>
        )}

        {staleEdit && base && (
          <Callout.Root color="amber" size="2" role="alert">
            <Callout.Icon>
              <AlertTriangle size={18} />
            </Callout.Icon>
            <div>
              <Text as="div" size="2" weight="bold" mb="1">
                Сценарий уже изменили
              </Text>
              <Text as="p" size="2">
                Пока вы правили версию {base.version}, опубликована более новая.
                Ваши правки не опубликованы, чтобы не затереть чужие: откройте
                актуальную версию и внесите их в неё.
              </Text>
              <Button
                type="button"
                size="1"
                variant="soft"
                color="amber"
                mt="2"
                onClick={() => void openLatestVersion()}
              >
                Открыть актуальную версию
              </Button>
            </div>
          </Callout.Root>
        )}

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

        {(published?.scenarioVersionId ?? base?.scenarioVersionId) && (
          <ScenarioAudioPreparation
            key={published?.scenarioVersionId ?? base?.scenarioVersionId}
            versionId={
              (published?.scenarioVersionId ?? base?.scenarioVersionId)!
            }
          />
        )}

        {/* Пока помощник собирает черновик, скелетоном становятся только поля. */}
        {!published && (
          <DialoguePreparationPanel
            scenario={scenario}
            onChange={setPreparation}
            disabled={busy}
            authoringSource={authoringSource}
            authoringPrompt={authoringPrompt}
            scopeCode={base ? scenario.code : undefined}
            onRestore={(snapshot) => {
              geocodingRequestRef.current += 1;
              reverseGeocoding.reset();
              setScenario(snapshot.scenario);
              setAuthoringSource(snapshot.authoringSource);
              setAuthoringPrompt(snapshot.authoringPrompt ?? undefined);
              setFieldErrors(new Map());
            }}
          />
        )}
        <ScenarioFormLoadingContext value={draft.isPending}>
          <ScenarioFormErrorsContext value={errorsContext}>
            <ScenarioBasicsSection
              scenario={scenario}
              onChange={updateScenario}
              codeLocked={Boolean(base)}
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
          </ScenarioFormErrorsContext>
        </ScenarioFormLoadingContext>
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
          variant="surface"
          className="pointer-events-auto [--card-background-color:var(--color-panel-solid)]"
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
              disabled={busy || grammarCheck.isPending}
              onClick={() => {
                setGrammarOpen(true);
                grammarCheck.mutate(scenario);
              }}
            >
              <SpellCheck size={16} /> Проверить грамматику
            </Button>
            <Button
              type="button"
              size="2"
              variant="soft"
              color="gray"
              disabled={busy}
              onClick={resetManual}
            >
              <RotateCcw size={16} /> {base ? "Сбросить правки" : "Очистить"}
            </Button>
            <Button
              type="button"
              size="2"
              disabled={
                busy ||
                Boolean(published) ||
                !preparationCanPublish(preparation, scenario)
              }
              onClick={() => void publish()}
            >
              {publishing ? <Spinner size="1" /> : <CheckCircle2 size={16} />}
              {publishing
                ? "Публикуем…"
                : base
                  ? `Опубликовать версию ${base.version + 1}`
                  : "Проверить и опубликовать"}
            </Button>
          </Flex>
        </Card>
      </Flex>

      <ScenarioGrammarDialog
        open={grammarOpen}
        onOpenChange={setGrammarOpen}
        report={grammarCheck.data ?? null}
        pending={grammarCheck.isPending}
        error={grammarCheck.error?.message}
      />

      <ScenarioAiHelper
        open={helperOpen}
        onOpenChange={setHelperOpen}
        pending={draft.isPending}
        error={helperError}
        onErrorDismiss={() => setHelperError(undefined)}
        onGenerate={(brief) => void generate(brief)}
      />
    </Box>
  );
}
