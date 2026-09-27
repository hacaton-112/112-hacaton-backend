import {
  Bell,
  ChevronUp,
  Eye,
  MoreHorizontal,
  Pencil,
  Phone,
  X,
} from "lucide-react";
import type { ReactNode } from "react";

import type { DdsExercise } from "../../contracts/dds-exercise";
import {
  DDS_CATEGORY_LABELS,
  DDS_SERVICE_LABELS,
  DDS_STATUS_LABELS,
} from "./dds-formatters";

const time = (value: string) =>
  new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

const dateTime = (value: string) =>
  new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/**
 * Верх карточки повторяет АРМ-112 для ДДС: полоса телефонии, номер
 * происшествия, сведения заявителя и классификатор.
 *
 * Поля, которых в учебном контуре нет, остаются пустыми, как в реальной
 * системе: диспетчеру важно узнавать своё рабочее место, а не видеть
 * подставленные значения.
 */
export function DdsCardArmHeader({
  exercise,
  journalOpen,
  onToggleJournal,
  canEdit,
  onEdit,
  onClose,
  phoneControl,
  serviceOverlay,
}: {
  exercise: DdsExercise;
  journalOpen: boolean;
  onToggleJournal: () => void;
  canEdit: boolean;
  onEdit: () => void;
  onClose?: () => void;
  phoneControl?: ReactNode;
  serviceOverlay?: ReactNode;
}) {
  const { card } = exercise;
  const number = exercise.id.slice(-8).toUpperCase();

  return (
    <div className="arm-card">
      <div className="arm-card-phonebar">
        <div className="arm-card-phone">
          <span className="arm-card-phone-label">
            <Phone size={13} /> Отключение
          </span>
          <div className="arm-card-phone-buttons">
            <span>записи звонков</span>
            <span>список SMS</span>
          </div>
        </div>
        <div className="arm-card-phone">
          <span className="arm-card-phone-label">
            <Phone size={13} /> АОН
          </span>
          <strong>{card.callerPhone ?? "—"}</strong>
        </div>
        <div className="arm-card-phone">
          <span className="arm-card-phone-label">
            <Phone size={13} /> предоставленный
          </span>
          <strong>—</strong>
        </div>
        <div className="arm-card-phone">
          <span className="arm-card-phone-label">
            <Phone size={13} /> телефон на место
          </span>
          <strong>—</strong>
        </div>
        <div className="arm-card-incident">
          <div>
            <strong>Происшествие {number}</strong>
            <span>Сохр. {dateTime(exercise.createdAt)}</span>
            <span>{DDS_SERVICE_LABELS[exercise.addressedService]}</span>
          </div>
          <div className="arm-card-incident-actions">
            <button
              type="button"
              aria-expanded={journalOpen}
              onClick={onToggleJournal}
            >
              <Eye size={13} />
              {journalOpen ? "скрыть" : "просмотр"}
            </button>
            {canEdit && (
              <button
                type="button"
                aria-label="Открыть редактор статуса"
                onClick={onEdit}
              >
                <MoreHorizontal size={13} /> дополнительно
              </button>
            )}
            {phoneControl}
          </div>
        </div>
      </div>

      <div className="arm-card-body">
        <div className="arm-card-left">
          <div className="arm-card-strip">
            <span>ФИО заявителя</span>
            <strong>{card.callerName}</strong>
          </div>
          <div className="arm-card-address">
            <strong>{card.addressText}</strong>
            <span>
              {card.latitude.toFixed(6)}, {card.longitude.toFixed(6)}
            </span>
          </div>
          <div className="arm-card-journal">
            <p>
              <span>{dateTime(exercise.createdAt)}</span> 0{" "}
              {DDS_SERVICE_LABELS[exercise.addressedService]}
            </p>
            <p className="arm-card-journal-text">{card.description}</p>
          </div>
        </div>

        <div className="arm-card-right">
          <div className="arm-card-flags">
            <span>
              Пострадавшие:{" "}
              <b>{card.victimsTotal === null ? "нет" : card.victimsTotal}</b>
            </span>
            <span>
              Отказ от скорой: <b>нет</b>
            </span>
            <span>
              Заблокированные: <b>нет</b>
            </span>
            <span className="arm-card-badge">ЧС</span>
            <span className="arm-card-badge arm-card-badge-warn">ЧП</span>
          </div>

          <div className="arm-card-block">
            <div className="arm-card-block-head">
              Происшествие {card.scenarioCode}
            </div>
            <div className="arm-card-block-row">
              {[card.title, card.incidentType].filter(Boolean).join(" . ")} .
            </div>
            <div className="arm-card-block-row">
              Класс.:{" "}
              <b>{DDS_CATEGORY_LABELS[card.category] ?? card.category}</b> ;
            </div>
            <div className="arm-card-block-row arm-card-block-row-muted">
              [ВИС] Класс.:
            </div>
          </div>
        </div>
      </div>

      <div className="arm-card-service-stage">
        {serviceOverlay}
        {/* Плитки переносятся строкой выше, как в АРМ: wrap-reverse в стилях. */}
        <div className="arm-card-services" aria-label="Оповещённые службы">
          <span className="arm-card-services-label">Службы:</span>
          {card.services.map((service) => {
            const addressed = service === exercise.addressedService;
            const last = exercise.events.at(-1);

            return (
              <div
                key={service}
                className="arm-card-service-tile"
                data-active={addressed || undefined}
              >
                <div className="arm-card-service-tools">
                  <button
                    type="button"
                    aria-label={
                      journalOpen
                        ? `Скрыть журнал службы «${DDS_SERVICE_LABELS[service]}»`
                        : `Показать журнал службы «${DDS_SERVICE_LABELS[service]}»`
                    }
                    aria-expanded={addressed ? journalOpen : undefined}
                    disabled={!addressed}
                    onClick={onToggleJournal}
                  >
                    <ChevronUp size={13} />
                  </button>
                  {addressed && canEdit && (
                    <button
                      type="button"
                      aria-label="Изменить статус службы"
                      onClick={onEdit}
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                </div>
                <strong>{DDS_SERVICE_LABELS[service]}</strong>
                <span>
                  {addressed && last
                    ? `${time(last.occurredAt)} ${DDS_STATUS_LABELS[exercise.status]}`
                    : `${time(exercise.createdAt)} Добавлена`}
                </span>
              </div>
            );
          })}
          <div className="arm-card-services-spacer" aria-hidden="true" />
          <div className="arm-card-service-utility">
            <button type="button" aria-label="Уведомления по карточке" disabled>
              <Bell size={15} />
            </button>
            {onClose && (
              <button
                type="button"
                aria-label="Закрыть карточку"
                onClick={onClose}
              >
                <X size={17} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
