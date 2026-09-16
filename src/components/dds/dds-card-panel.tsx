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
    <div className="min-w-0">
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
        className="grid place-content-center gap-2 text-center"
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
    <div className="grid content-start gap-4">
      <Card size="3" variant="classic" className="grid gap-4">
        <Flex align="start" justify="between" gap="3" wrap="wrap">
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

        <Grid columns={{ initial: "1", sm: "2" }} gap="4">
          <Card size="2" variant="surface" className="grid gap-3">
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

          <Card size="2" variant="surface" className="grid gap-3">
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

        <Card size="2" variant="surface" className="grid gap-3">
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
          <div>
            <Text as="p" size="1" color="gray" mb="1">
              Оповещённые службы
            </Text>
            <Flex gap="1" wrap="wrap">
              {card.services.map((service) => (
                <Badge key={service} color="blue" variant="soft">
                  {DDS_SERVICE_LABELS[service]}
                </Badge>
              ))}
            </Flex>
          </div>
        </Card>

        <DdsStatusActions
          exercise={exercise}
          pending={pending}
          error={error}
          onTransition={onTransition}
        />
      </Card>

      {exercise.result && (
        <Card size="3" variant="classic">
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

      <Card size="3" variant="classic">
        <Heading size="3" mb="3">
          Хронология реагирования
        </Heading>
        <div className="grid gap-3">
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
