import {
  Button,
  Checkbox,
  DatePicker,
  NumberField,
  Text,
} from "@bolid-ui/themes";
import { MapPin, X } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, type ReactNode } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type UseFormRegister,
} from "react-hook-form";

import {
  EMPTY_INCIDENT_CARD,
  INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_LABELS,
  type IncidentCard,
  type IncidentCardInput,
  type IncidentCardPatch,
  IncidentCardSchema,
} from "../../contracts/incident";
import type { IncidentLocationFill } from "../../contracts/geo";
import type { IncidentCardRequirement } from "../../lib/incident-card-readiness";
import { FormField } from "../auth/form-field";
import { ClassifierPicker } from "./classifier-picker";

/** Те же три параметра, что у формы: вход, контекст резолвера и результат. */
type CardControl = Control<IncidentCardInput, unknown, IncidentCard>;

interface IncidentFormProps {
  sessionId?: string;
  disabled?: boolean;
  /** Карточка звонка: приходит с backend и переживает перезагрузку окна. */
  card?: IncidentCard;
  /** Вызывается на каждое изменение: карточка пишется по ходу разговора. */
  onChange?: (patch: IncidentCardPatch) => void;
  /** Место, отмеченное на карте: адрес и координаты подставляются в поля. */
  locationFill?: IncidentLocationFill;
  /** Обязательные для отправки поля, которые оператор ещё не заполнил. */
  missingRequirements?: readonly IncidentCardRequirement[];
  /** Строка заявителя: в АРМ она стоит над адресом, в том же столбце. */
  callerSlot?: ReactNode;
  /** Карта — отдельное действие в заголовке адреса, а не постоянная панель. */
  locationAction?: ReactNode;
}

export function IncidentForm({
  sessionId,
  disabled = false,
  card,
  onChange,
  locationFill,
  missingRequirements = [],
  callerSlot,
  locationAction,
}: IncidentFormProps) {
  const { control, register, reset, getValues, setValue } = useForm<
    IncidentCardInput,
    unknown,
    IncidentCard
  >({
    resolver: zodResolver(IncidentCardSchema),
    defaultValues: EMPTY_INCIDENT_CARD,
  });
  const initializedSession = useRef<string | undefined>(undefined);

  // Карточку присылает backend: она могла заполняться до перезагрузки окна.
  useEffect(() => {
    if (!sessionId) {
      initializedSession.current = undefined;
      reset(EMPTY_INCIDENT_CARD);
      return;
    }

    if (card && initializedSession.current !== sessionId) {
      initializedSession.current = sessionId;
      reset(card);
    }
  }, [card, reset, sessionId]);

  // Точка с карты пишется через форму, а не мимо неё: форма держит свои
  // значения и при следующем вводе вернула бы в карточку старый адрес. Поля
  // остаются редактируемыми — подстановка лишь подсказка оператору.
  const appliedFill = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (
      !locationFill ||
      disabled ||
      !sessionId ||
      initializedSession.current !== sessionId ||
      appliedFill.current === locationFill.revision
    ) {
      return;
    }

    appliedFill.current = locationFill.revision;
    const options = { shouldDirty: true, shouldTouch: true } as const;
    setValue("latitude", locationFill.latitude, options);
    setValue("longitude", locationFill.longitude, options);

    if (locationFill.addressText !== undefined) {
      setValue("addressText", locationFill.addressText, options);
    }
  }, [disabled, locationFill, sessionId, setValue]);

  // Кнопки «сохранить» в АРМ нет: карточка уходит на сервер по ходу разговора,
  // а закрывает её конец звонка.
  const values = useWatch({ control });

  useEffect(() => {
    if (!sessionId || initializedSession.current !== sessionId) return;

    const parsed = IncidentCardSchema.safeParse(getValues());

    if (parsed.success) {
      onChange?.(pickIncidentDetails(parsed.data));
    }
  }, [values, getValues, onChange, sessionId]);

  const clearAddress = () => {
    const options = { shouldDirty: true, shouldTouch: true } as const;
    setValue("addressText", "", options);
    setValue("district", "", options);
    setValue("objectType", "", options);
    setValue("entrance", "", options);
    setValue("floor", "", options);
    setValue("intercom", "", options);
    setValue("placeNotes", "", options);
    setValue("latitude", null, options);
    setValue("longitude", null, options);
  };
  const descriptionLength = values.description?.length ?? 0;

  return (
    <form className="arm112-card" data-tour="incident" noValidate>
      <div className="arm112-column">
        {callerSlot}

        <section className="arm112-block" aria-labelledby="location-title">
          <header className="arm112-address-head">
            <span id="location-title">
              <MapPin size={14} aria-hidden /> Адрес:
            </span>
            <div className="arm112-address-toolbar">
              {locationAction}
              <button
                type="button"
                className="arm112-icon-button"
                aria-label="Очистить адрес"
                title="Очистить адрес"
                disabled={disabled}
                onClick={clearAddress}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          </header>

          <RequiredField
            missing={missingRequirements.includes("address")}
            message="Укажите адрес происшествия"
          >
            <input
              id="addressText"
              className="arm112-address-value"
              placeholder="Введите адрес"
              autoComplete="off"
              disabled={disabled}
              aria-invalid={missingRequirements.includes("address")}
              {...register("addressText")}
            />
          </RequiredField>

          <div className="arm112-grid">
            <LineField
              name="district"
              label="Округ, район"
              register={register}
              disabled={disabled}
            />
            <LineField
              name="objectType"
              label="Объект"
              register={register}
              disabled={disabled}
            />
            <LineField
              name="entrance"
              label="Подъезд"
              register={register}
              disabled={disabled}
            />
            <LineField
              name="floor"
              label="Этаж"
              register={register}
              disabled={disabled}
            />
            <LineField
              name="intercom"
              label="Код, домофон"
              register={register}
              disabled={disabled}
            />
            <LineField
              name="latitude"
              label="Широта"
              register={register}
              disabled={disabled}
            />
            <LineField
              name="longitude"
              label="Долгота"
              register={register}
              disabled={disabled}
            />
            <label className="arm112-nearby">
              <Controller
                control={control}
                name="nearby"
                render={({ field }) => (
                  <Checkbox
                    size="1"
                    checked={field.value}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                )}
              />
              Рядом
            </label>
          </div>

          <LineField
            name="placeNotes"
            label="Описательный адрес"
            register={register}
            disabled={disabled}
            wide
          />

          <div className="arm112-address-actions">
            <button
              type="button"
              className="arm112-flat-button"
              disabled={disabled}
              onClick={clearAddress}
            >
              очистить адрес
            </button>
          </div>
        </section>

        <section className="arm112-block arm112-description">
          <span className="arm112-block-label">Описание со слов заявителя</span>
          <RequiredField
            missing={missingRequirements.includes("description")}
            message="Запишите краткое описание со слов заявителя"
          >
            <textarea
              id="description"
              placeholder="введите"
              maxLength={1999}
              disabled={disabled}
              aria-invalid={missingRequirements.includes("description")}
              {...register("description")}
            />
          </RequiredField>
          <span className="arm112-counter">{descriptionLength} / 1999</span>
        </section>
      </div>

      <div className="arm112-column">
        {/* Строка сведений о происшествии: в АРМ она стоит над типом, потому
            что пострадавших и дату оператор уточняет по ходу разговора. */}
        <div className="arm112-facts">
          <CountField
            name="victimsTotal"
            label="Пострадавшие"
            control={control}
            disabled={disabled}
          />
          <CountField
            name="victimsChildren"
            label="Из них детей"
            control={control}
            disabled={disabled}
          />
          <CountField
            name="deathsTotal"
            label="Погибшие"
            control={control}
            disabled={disabled}
          />
          <CountField
            name="deathsChildren"
            label="Из них детей"
            control={control}
            disabled={disabled}
          />
          <FormField label="Дата происшествия" htmlFor="startedAt">
            <Controller
              control={control}
              name="startedAt"
              render={({ field }) => (
                <DatePicker
                  id="startedAt"
                  size="1"
                  placeholder="дд.мм.гггг"
                  value={field.value ? new Date(field.value) : null}
                  disabled={disabled}
                  onChange={(value) => field.onChange(toIsoDate(value))}
                />
              )}
            />
          </FormField>
        </div>

        <Controller
          control={control}
          name="categories"
          render={({ field }) => (
            <div className="arm112-q-row">
              <span className="arm112-q-label">Метки происшествия</span>
              <div className="arm112-q-chips">
                {INCIDENT_CATEGORIES.map((category) => {
                  const active = field.value.includes(category);

                  return (
                    <Tag
                      key={category}
                      active={active}
                      disabled={disabled}
                      onClick={() =>
                        field.onChange(
                          active
                            ? field.value.filter((item) => item !== category)
                            : [...field.value, category],
                        )
                      }
                    >
                      {INCIDENT_CATEGORY_LABELS[category]}
                    </Tag>
                  );
                })}
              </div>
            </div>
          )}
        />

        <RequiredField
          missing={
            missingRequirements.includes("incidentType") ||
            missingRequirements.includes("classifierRouting")
          }
          message="Выберите тип и классификацию происшествия"
        >
          <ClassifierPicker
            entryId={card?.classifierEntryId ?? null}
            qualifierCodes={card?.classifierQualifierCodes ?? []}
            routing={card?.classifierRouting ?? null}
            incidentType={card?.incidentType ?? null}
            disabled={disabled}
            onChange={onChange}
          />
        </RequiredField>
      </div>
    </form>
  );
}

function RequiredField({
  missing,
  message,
  children,
}: {
  missing: boolean;
  message: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="arm-required-target"
      data-missing={missing || undefined}
      aria-invalid={missing || undefined}
    >
      {children}
      {missing && (
        <Text as="p" size="1" color="red" weight="bold" mt="1">
          {message}
        </Text>
      )}
    </div>
  );
}

const pickIncidentDetails = (card: IncidentCard): IncidentCardPatch => ({
  addressText: card.addressText,
  district: card.district,
  objectType: card.objectType,
  entrance: card.entrance,
  floor: card.floor,
  intercom: card.intercom,
  latitude: card.latitude,
  longitude: card.longitude,
  nearby: card.nearby,
  placeNotes: card.placeNotes,
  categories: card.categories,
  startedAt: card.startedAt,
  victimsTotal: card.victimsTotal,
  victimsChildren: card.victimsChildren,
  deathsTotal: card.deathsTotal,
  deathsChildren: card.deathsChildren,
  description: card.description,
});

const toIsoDate = (
  value: Date | { year: number; month: number; day: number } | null,
): string | null => {
  if (!value) return null;

  const year = value instanceof Date ? value.getFullYear() : value.year;
  const month = value instanceof Date ? value.getMonth() : value.month - 1;
  const day = value instanceof Date ? value.getDate() : value.day;

  return new Date(year, month, day, 12).toISOString();
};

type TextFieldName =
  | "district"
  | "objectType"
  | "entrance"
  | "floor"
  | "intercom"
  | "latitude"
  | "longitude"
  | "placeNotes";

/**
 * Поле АРМ: подпись сверху, значение на подчёркнутой строке.
 *
 * Рамок у полей в реальной системе нет — их роль играет линия под текстом,
 * и за счёт этого в столбец помещается весь адрес целиком.
 */
function LineField({
  name,
  label,
  register,
  disabled,
  wide = false,
}: {
  name: TextFieldName;
  label: string;
  register: UseFormRegister<IncidentCardInput>;
  disabled: boolean;
  wide?: boolean;
}) {
  return (
    <label
      className="arm112-field"
      data-wide={wide || undefined}
      htmlFor={name}
    >
      <span>{label}</span>
      <input
        id={name}
        autoComplete="off"
        disabled={disabled}
        {...register(name)}
      />
    </label>
  );
}

type CountFieldName =
  "victimsTotal" | "victimsChildren" | "deathsTotal" | "deathsChildren";

function CountField({
  name,
  label,
  control,
  disabled,
}: {
  name: CountFieldName;
  label: string;
  control: CardControl;
  disabled: boolean;
}) {
  return (
    <FormField label={label} htmlFor={name}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <NumberField.Root
            id={name}
            size="1"
            className="w-full"
            placeholder="Введите кол-во"
            value={
              field.value === "" || field.value === null
                ? undefined
                : Number(field.value)
            }
            onChange={field.onChange}
            onBlur={field.onBlur}
            decrementAriaLabel={`Уменьшить: ${label}`}
            incrementAriaLabel={`Увеличить: ${label}`}
            minValue={0}
            maxValue={9_999}
            disabled={disabled}
          />
        )}
      />
    </FormField>
  );
}

function Tag({
  children,
  active = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      size="1"
      color={active ? "blue" : "gray"}
      variant={active ? "solid" : "soft"}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
