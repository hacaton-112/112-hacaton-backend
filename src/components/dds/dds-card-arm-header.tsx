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
export function DdsCardArmHeader({ exercise }: { exercise: DdsExercise }) {
  const { card } = exercise;
  const number = exercise.id.slice(-8).toUpperCase();

  return (
    <div className="arm-card">
      <div className="arm-card-phonebar">
        <div className="arm-card-phone">
          <span>Отключение</span>
          <div className="arm-card-phone-buttons">
            <span>записи звонков</span>
            <span>список SMS</span>
          </div>
        </div>
        <div className="arm-card-phone">
          <span>АОН</span>
          <strong>{card.callerPhone}</strong>
        </div>
        <div className="arm-card-phone">
          <span>предоставленный</span>
          <strong />
        </div>
        <div className="arm-card-phone">
          <span>телефон на место</span>
          <strong />
        </div>
        <div className="arm-card-incident">
          <strong>Происшествие {number}</strong>
          <span>Сохр. {dateTime(exercise.createdAt)}</span>
          <span>{DDS_SERVICE_LABELS[exercise.addressedService]}</span>
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
              Класс.: <b>{DDS_CATEGORY_LABELS[card.category] ?? card.category}</b> ;
            </div>
            <div className="arm-card-block-row arm-card-block-row-muted">
              [ВИС] Класс.:
            </div>
          </div>
        </div>
      </div>

      <div className="arm-card-services" aria-label="Оповещённые службы">
        <span className="arm-card-services-label">Службы:</span>
        {card.services.map((service) => {
          const addressed = service === exercise.addressedService;
          const last = exercise.events.at(-1);

          return (
            <div key={service} data-active={addressed || undefined}>
              <strong>{DDS_SERVICE_LABELS[service]}</strong>
              <span>
                {addressed && last
                  ? `${time(last.occurredAt)} ${DDS_STATUS_LABELS[exercise.status]}`
                  : `${time(exercise.createdAt)} Добавлена`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
