import {
  Badge,
  Button,
  Flex,
  Grid,
  Heading,
  Separator,
  Tabs,
  Text,
} from "@bolid-ui/themes";
import { useLocation, useNavigate } from "react-router";

import type { Debrief } from "../../contracts/debrief";
import { DISPATCH_SERVICE_LABELS } from "../../contracts/incident";
import { useAuthStore } from "../../stores/auth.store";
import { formatDuration, PANIC_LABELS } from "./debrief-formatters";
import {
  DebriefLine,
  DebriefNotice,
  DebriefPanel,
  DebriefScroll,
  DebriefSection,
} from "./debrief-primitives";
import {
  QuestionsTable,
  RecommendationsSection,
  ReferenceSection,
} from "./debrief-questions";
import { GrammarSection } from "./debrief-grammar";
import { AnswerStatsSection, ScoreSection, TimeSection } from "./debrief-score";
import { GroupSection, SkillsSection } from "./debrief-skills";
import { Transcript } from "./debrief-transcript";
import { ROUTES } from "../../config/routes";
import { Breadcrumbs } from "../ui/breadcrumbs";

interface DebriefDetailsProps {
  debrief?: Debrief;
  isPending: boolean;
  error: Error | null;
  loadRecordingSegment: (url: string) => Promise<string>;
}

/** Фамилия с инициалами: в сравнении с группой из макета оператор подписан так. */
const shortName = (fullName?: string) => {
  if (fullName === undefined || fullName.trim() === "") {
    return undefined;
  }

  const [last, ...rest] = fullName.trim().split(/\s+/);

  return rest.length === 0
    ? last
    : `${last} ${rest.map((part) => `${part[0]}.`).join("")}`;
};

const debriefBackLink = (state: unknown): { to: string; label: string } => {
  if (
    state &&
    typeof state === "object" &&
    "backTo" in state &&
    typeof state.backTo === "string"
  ) {
    return {
      to: state.backTo,
      label:
        "backLabel" in state && typeof state.backLabel === "string"
          ? state.backLabel
          : "Назад",
    };
  }
  return { to: ROUTES.debrief(), label: "К списку вызовов" };
};

export function DebriefDetails({
  debrief,
  isPending,
  error,
  loadRecordingSegment,
}: DebriefDetailsProps) {
  const navigate = useNavigate();
  // Со страницы ученика разбор возвращает к ученику, иначе — к своим звонкам.
  const back = debriefBackLink(useLocation().state);
  const user = useAuthStore((state) => state.user);

  if (error) {
    return (
      <DebriefNotice>Не удалось открыть разбор: {error.message}</DebriefNotice>
    );
  }

  if (isPending || !debrief) {
    return <DebriefNotice>Загружаю…</DebriefNotice>;
  }

  const evaluation = debrief.evaluation;
  const hasRecommendations = Boolean(evaluation?.recommendations.length);
  const hasReference = Boolean(evaluation?.fields.length);

  /*
   * Раскладка по ширине окна:
   * - xl: три колонки до низа окна, как в макете; каждая прокручивается сама;
   * - lg: две колонки до низа окна — навыки уходят под итог в левую, и обе
   *   карточки делят её высоту;
   * - уже: одна колонка, прокручивается страница, а у разбора своя высота в
   *   экран, чтобы вкладки и плеер не уезжали из виду вместе с историей.
   *
   * Прокрутку страницы на узком экране даёт SidebarInset из общей раскладки,
   * поэтому своей обёртки со скроллом здесь нет: колонки внутри неё не смогли
   * бы взять высоту окна.
   */
  const backBreadcrumbLabel =
    back.to === ROUTES.debrief()
      ? "Разбор звонков"
      : back.label === "К ученику"
        ? "Ученик"
        : back.label.startsWith("К ")
          ? back.label.slice(2)
          : back.label;

  return (
    <Flex direction="column" gap="4" p="4" className="min-h-full lg:h-full">
      <Breadcrumbs
        items={[
          { label: backBreadcrumbLabel, to: back.to },
          { label: `${debrief.call.scenarioCode} · ${debrief.call.title}` },
        ]}
      />
      <Flex
        align="center"
        justify="between"
        gap="4"
        wrap="wrap"
        className="shrink-0"
      >
        <Flex align="center" gap="4" wrap="wrap">
          <Heading as="h1" size="6" weight="bold" trim="both">
            {debrief.call.title}
          </Heading>
          {evaluation && (
            <Badge color="orange" variant="soft">
              Сложность {evaluation.difficulty}/5
            </Badge>
          )}
          <Badge color="gray" variant="soft">
            {debrief.call.scenarioCode}
          </Badge>
        </Flex>
        <Flex gap="2">
          <Button variant="soft" color="gray" onClick={() => navigate("/")}>
            Пройти заново
          </Button>
          <Button onClick={() => navigate(back.to)}>{back.label}</Button>
        </Flex>
      </Flex>

      <Grid
        gap="4"
        columns={{
          initial: "minmax(0, 1fr)",
          lg: "360px minmax(0, 1fr)",
          xl: "360px minmax(0, 1fr) 360px",
        }}
        rows={{ lg: "minmax(0, 1fr)" }}
        className="shrink-0 lg:min-h-140 lg:flex-1 lg:shrink"
      >
        {/*
         * На lg итог и навыки делят одну колонку; на xl обёртка исчезает
         * (display: contents), и карточки встают в свои колонки сетки.
         */}
        <Flex direction="column" gap="4" className="min-h-0 xl:contents">
          <DebriefPanel className="xl:col-start-1 xl:row-start-1">
            {evaluation && (
              <>
                <ScoreSection evaluation={evaluation} />
                <Separator size="4" />
              </>
            )}
            <TimeSection debrief={debrief} />
            <Separator size="4" />
            <AnswerStatsSection debrief={debrief} />
          </DebriefPanel>

          {evaluation && (
            <DebriefPanel className="lg:grow xl:col-start-3 xl:row-start-1">
              <SkillsSection evaluation={evaluation} />
              <Separator size="4" />
              <GroupSection
                evaluation={evaluation}
                operatorName={shortName(user?.fullName)}
              />
            </DebriefPanel>
          )}
        </Flex>

        <DebriefPanel
          scroll={false}
          className="h-[max(480px,calc(var(--app-viewport-height)-80px))] min-w-0 lg:col-start-2 lg:row-start-1 lg:h-auto"
        >
          <Tabs.Root
            defaultValue="conversation"
            className="flex min-h-0 flex-1 flex-col"
          >
            <Tabs.List
              size="2"
              mx="5"
              mt="3"
              className="debrief-detail-tabs shrink-0"
            >
              <Tabs.Trigger value="questions" className="flex-1">
                Детализация по вопросам
              </Tabs.Trigger>
              <Tabs.Trigger value="conversation" className="flex-1">
                Детализация по разговору
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content
              value="questions"
              className="flex min-h-0 flex-1 flex-col"
            >
              <DebriefScroll className="px-5">
                <DebriefSection className="px-0!">
                  <QuestionsTable debrief={debrief} />
                </DebriefSection>
                {evaluation && hasRecommendations && (
                  <RecommendationsSection evaluation={evaluation} />
                )}
                {hasRecommendations && hasReference && <Separator size="4" />}
                {evaluation && hasReference && (
                  <ReferenceSection evaluation={evaluation} />
                )}
                {(hasRecommendations || hasReference) && <Separator size="4" />}
                <CallStateSection debrief={debrief} />
                <Separator size="4" />
                <IncidentCardSection debrief={debrief} />
                {debrief.grammar && (
                  <>
                    <Separator size="4" />
                    <GrammarSection grammar={debrief.grammar} />
                  </>
                )}
              </DebriefScroll>
            </Tabs.Content>

            <Tabs.Content
              value="conversation"
              className="flex min-h-0 flex-1 flex-col"
            >
              <Transcript
                debrief={debrief}
                loadRecordingSegment={loadRecordingSegment}
              />
            </Tabs.Content>
          </Tabs.Root>
        </DebriefPanel>
      </Grid>
    </Flex>
  );
}

/** Чем закончился звонок для заявителя, а не для оценки. */
function CallStateSection({ debrief }: { debrief: Debrief }) {
  const closed = debrief.questions.filter((question) => question.satisfied);

  return (
    <DebriefSection title="Как прошёл вызов" className="px-0!">
      <Grid gap="2">
        <DebriefLine
          label="Разговор"
          value={formatDuration(debrief.timings.durationSeconds)}
        />
        <DebriefLine
          label="Обязательные вопросы"
          value={`${closed.length} из ${debrief.questions.length}`}
          bad={closed.length < debrief.questions.length}
        />
        <DebriefLine
          label="Состояние заявителя в конце"
          value={PANIC_LABELS[debrief.finalPanicLevel] ?? "—"}
          bad={debrief.finalPanicLevel >= 3}
        />
      </Grid>
    </DebriefSection>
  );
}

function IncidentCardSection({ debrief }: { debrief: Debrief }) {
  const card = debrief.incidentCard;

  return (
    <DebriefSection title="Карточка происшествия" className="px-0!">
      {card === null ? (
        <Text size="2" color="gray">
          Оператор ничего не записал.
        </Text>
      ) : (
        <Grid gap="2">
          <DebriefLine label="Адрес" value={card.addressText ?? "—"} />
          <DebriefLine label="Тип" value={card.incidentType ?? "—"} />
          <DebriefLine
            label="Пострадавшие"
            value={`${card.victimsTotal ?? "—"}, из них детей ${card.victimsChildren ?? "—"}`}
          />
          <DebriefLine
            label="Службы"
            value={
              card.services.length === 0
                ? "не выбраны"
                : card.services
                    .map((service) => DISPATCH_SERVICE_LABELS[service])
                    .join(", ")
            }
            bad={card.services.length === 0}
          />
          <DebriefLine label="Описание" value={card.description ?? "—"} />
        </Grid>
      )}
    </DebriefSection>
  );
}
