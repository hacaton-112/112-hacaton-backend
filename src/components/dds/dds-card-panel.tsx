import {
  Badge,
  Card,
  Flex,
  Grid,
  Heading,
  Separator,
  Text,
} from "@bolid-ui/themes";
import { ClipboardCheck, MapPin, Phone, Trophy, UserRound } from "lucide-react";

import type {
  DdsExercise,
  DdsResponseStatus,
} from "../../contracts/dds-exercise";
import { DdsAcknowledgementTimer } from "./dds-acknowledgement-timer";
import {
  DDS_SERVICE_LABELS,
  DDS_STATUS_LABELS,
  DDS_VIOLATION_LABELS,
} from "./dds-formatters";
import { DdsStatusActions } from "./dds-status-actions";

type TransitionStatus = Exclude<DdsResponseStatus, "pending">;

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="arm-dds-field min-w-0">
      <Text as="p" size="1" color="gray">
        {label}
      </Text>
      <Text as="p" size="2" weight="medium">
        {value || "Не указано"}
      </Text>
    </div>
  );
}

export function DdsCardPanel({
  exercise,
  pending,
  error,
  onTransition,
}: {
  exercise?: DdsExercise;
  pending: boolean;
  error?: string;
  onTransition: (status: TransitionStatus, comment?: string) => Promise<void>;
}) {
  if (!exercise) {
    return (
      <Card
        size="3"
        variant="classic"
        className="arm-dds-card-empty grid place-content-center gap-2 text-center"
      >
        <ClipboardCheck className="text-gray-8 mx-auto" size={34} />
        <Heading size="4">Выберите учебную карточку</Heading>
        <Text size="2" color="gray">
          Новая карточка появится здесь после запуска упражнения.
        </Text>
      </Card>
    );
  }

  const { card } = exercise;

  return (
    <div className="arm-dds-card-panel grid content-start gap-2">
      <Card size="3" variant="classic" className="arm-dds-card grid gap-4">
        <Flex
          className="arm-dds-card-header"
          align="start"
          justify="between"
          gap="3"
          wrap="wrap"
        >
          <div>
            <Flex align="center" gap="2" mb="1">
              <Badge variant="soft">{card.scenarioCode}</Badge>
              <Badge
                color={
                  exercise.status === "completed"
                    ? "green"
                    : exercise.status === "refused"
                      ? "red"
                      : "amber"
                }
                variant="soft"
              >
                {DDS_STATUS_LABELS[exercise.status]}
              </Badge>
            </Flex>
            <Heading size="5">{card.title}</Heading>
            <Text as="p" size="2" color="gray" mt="1">
              Карточка направлена в службу «
              {DDS_SERVICE_LABELS[exercise.addressedService]}»
            </Text>
          </div>
          <DdsAcknowledgementTimer key={exercise.id} exercise={exercise} />
        </Flex>

        <Separator size="4" />

        <Grid
          className="arm-dds-info-grid"
          columns={{ initial: "1", sm: "2" }}
          gap="2"
        >
          <Card
            size="2"
            variant="surface"
            className="arm-dds-info-block grid gap-3"
          >
            <Flex align="center" gap="2">
              <MapPin size={17} />
              <Text size="2" weight="bold">
                Место происшествия
              </Text>
            </Flex>
            <Field label="Адрес" value={card.addressText} />
            <Text size="1" color="gray">
              Координаты: {card.latitude.toFixed(6)},{" "}
              {card.longitude.toFixed(6)}
            </Text>
          </Card>

          <Card
            size="2"
            variant="surface"
            className="arm-dds-info-block grid gap-3"
          >
            <Flex align="center" gap="2">
              <UserRound size={17} />
              <Text size="2" weight="bold">
                Заявитель
              </Text>
            </Flex>
            <Field label="ФИО" value={card.callerName} />
            <Flex align="center" gap="2">
              <Phone size={14} />
              <Text size="2">{card.callerPhone || "Телефон не указан"}</Text>
            </Flex>
          </Card>
        </Grid>

        <Card
          size="2"
          variant="surface"
          className="arm-dds-info-block arm-dds-incident-block grid gap-3"
        >
          <Grid columns={{ initial: "1", sm: "2" }} gap="3">
            <Field label="Тип происшествия" value={card.incidentType} />
            <Field
              label="Пострадавшие"
              value={
                card.victimsTotal === null
                  ? "Не указано"
                  : String(card.victimsTotal)
              }
            />
          </Grid>
          <Field label="Описание" value={card.description} />
        </Card>

        <div className="arm-dds-service-tabs" aria-label="Оповещённые службы">
          {card.services.map((service) => {
            const active = service === exercise.addressedService;

            return (
              <div key={service} data-active={active || undefined}>
                <strong>{DDS_SERVICE_LABELS[service]}</strong>
                <span>
                  {active
                    ? DDS_STATUS_LABELS[exercise.status]
                    : "Карточка добавлена"}
                </span>
              </div>
            );
          })}
        </div>

        <DdsStatusActions
          key={`${exercise.id}:${exercise.status}`}
          exercise={exercise}
          pending={pending}
          error={error}
          onTransition={onTransition}
        />
      </Card>

      {exercise.result && (
        <Card size="3" variant="classic" className="arm-dds-result">
          <Flex align="center" gap="3" wrap="wrap">
            <Trophy
              size={28}
              className={exercise.result.passed ? "text-green-9" : "text-red-9"}
            />
            <div className="min-w-0 flex-1">
              <Heading size="4">
                {exercise.result.passed
                  ? "Упражнение выполнено"
                  : "Упражнение не зачтено"}
              </Heading>
              <Text as="p" size="2" color="gray">
                Первичный статус:{" "}
                {exercise.result.acknowledgementMet
                  ? "в нормативе"
                  : "позже 30 секунд"}
                . Итог: {DDS_STATUS_LABELS[exercise.result.terminalStatus]}.
              </Text>
              <Text as="p" size="1" color="gray" mt="1">
                {exercise.result.violations.length === 0
                  ? "Нарушений не зафиксировано."
                  : exercise.result.violations
                      .map((violation) => DDS_VIOLATION_LABELS[violation])
                      .join(" · ")}
              </Text>
            </div>
            <Badge
              size="3"
              color={exercise.result.passed ? "green" : "red"}
              variant="soft"
            >
              {exercise.result.score} баллов
            </Badge>
          </Flex>
        </Card>
      )}

      <Card size="3" variant="classic" className="arm-dds-history">
        <div className="arm-dds-history-title">
          <Heading size="3">Хронология реагирования</Heading>
          <Text size="1">Событий: {exercise.events.length}</Text>
        </div>
        <div className="arm-dds-history-events grid gap-3">
          {exercise.events.map((event) => (
            <Flex key={event.sequence} align="start" gap="3">
              <Badge radius="full" variant="soft">
                {event.sequence}
              </Badge>
              <div>
                <Text as="p" size="2" weight="medium">
                  {DDS_STATUS_LABELS[event.toStatus]}
                </Text>
                <Text as="p" size="1" color="gray">
                  {new Date(event.occurredAt).toLocaleString("ru-RU")}
                  {event.comment ? ` · ${event.comment}` : ""}
                </Text>
              </div>
            </Flex>
          ))}
        </div>
      </Card>
    </div>
  );
}
