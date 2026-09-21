import { Text } from "@bolid-ui/themes";
import { Fragment } from "react";
import { ChevronDown, ClipboardList, Inbox, Link2, TimerReset } from "lucide-react";

import type { DdsExercise } from "../../contracts/dds-exercise";
import { DDS_SERVICE_LABELS, DDS_STATUS_LABELS } from "./dds-formatters";

export function DdsExerciseList({
  exercises,
  selectedId,
  onSelect,
}: {
  exercises: readonly DdsExercise[];
  selectedId?: string;
  onSelect: (exerciseId: string) => void;
}) {
  if (exercises.length === 0) {
    return (
      <div className="arm-dds-empty">
        <Inbox size={24} />
        <Text size="2">Поступивших карточек пока нет</Text>
      </div>
    );
  }

  return (
    <div className="arm-dds-table" role="table" aria-label="Происшествия">
      <div className="arm-dds-table-head" role="row">
        <span>Связи</span>
        <span>Опер.</span>
        <span>Номер</span>
        <span>Дата</span>
        <span>Время</span>
        <span>Тип происшествия</span>
        <span>Постр. Адрес</span>
        <span>Статус службы</span>
        <span />
      </div>
      {exercises.map((exercise) => {
        const terminal =
          exercise.status === "completed" || exercise.status === "refused";
        const createdAt = new Date(exercise.createdAt);

        return (
          <Fragment key={exercise.id}>
          <button
            type="button"
            className="arm-dds-table-row"
            data-selected={selectedId === exercise.id || undefined}
            data-terminal={terminal || undefined}
            onClick={() => onSelect(exercise.id)}
            role="row"
          >
            <span className="arm-dds-row-icons">
              <ChevronDown size={14} />
              <Link2 size={13} />
              <TimerReset size={13} />
            </span>
            <span className="arm-dds-operator-cell">0</span>
            <strong>{exercise.id.slice(-8).toUpperCase()}</strong>
            <span>
              {createdAt.toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
              })}
            </span>
            <strong>{createdAt.toLocaleTimeString("ru-RU")}</strong>
            <span className="arm-dds-cell-main">
              <strong>{exercise.card.incidentType}</strong>
              <small>{exercise.card.description}</small>
            </span>
            <span className="arm-dds-cell-main">
              <strong>{exercise.card.addressText}</strong>
              <small>{DDS_SERVICE_LABELS[exercise.addressedService]}</small>
            </span>
            <span className="arm-dds-status-cell">
              {DDS_STATUS_LABELS[exercise.status]}
            </span>
            <span className="arm-dds-row-open" aria-hidden="true">
              <ClipboardList size={15} />
            </span>
          </button>
          {selectedId === exercise.id && (
            <div className="arm-dds-row-description">
              <span>Описание:</span>
              <em>
                {createdAt.toLocaleString("ru-RU")}{" "}
                {DDS_SERVICE_LABELS[exercise.addressedService]}
              </em>
              <strong>{exercise.card.description}</strong>
            </div>
          )}
          </Fragment>
        );
      })}
    </div>
  );
}
