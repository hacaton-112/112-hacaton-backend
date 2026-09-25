import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Flex,
  IconButton,
  PhoneField,
  ScrollArea,
  Select,
  Separator,
  Text,
  TextArea,
  TextField,
} from "@bolid-ui/themes";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import {
  CALLER_LANGUAGE_OPTIONS,
  type IncidentCard,
  type IncidentCardPatch,
  type IncidentCardVictim,
} from "../../contracts/incident";
import { toDate, toDateOnly } from "../../lib/date-only";

interface CallerPanelProps {
  trainingSessionId?: string;
  callerNumber?: string;
  startedAt?: Date;
  operatorName: string;
  card?: IncidentCard;
  disabled: boolean;
  onChange: (patch: IncidentCardPatch) => void;
}

export function CallerPanel({
  trainingSessionId,
  callerNumber,
  startedAt,
  operatorName,
  card,
  disabled,
  onChange,
}: CallerPanelProps) {
  const victims = card?.victims ?? [];
  const victimsListRef = useRef<HTMLDivElement>(null);
  const previousVictimsCount = useRef(victims.length);

  useEffect(() => {
    const victimWasAdded = victims.length > previousVictimsCount.current;
    previousVictimsCount.current = victims.length;

    if (!victimWasAdded) return;

    const frame = requestAnimationFrame(() => {
      victimsListRef.current?.lastElementChild?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [victims.length]);

  const updateVictim = <K extends keyof IncidentCardVictim>(
    index: number,
    field: K,
    value: IncidentCardVictim[K],
  ) => {
    const current = card?.victims ?? [];
    const next = [...current];
    next[index] = { ...(next[index] ?? {}), [field]: value };
    onChange({ victims: next });
  };

  const addVictim = () => {
    onChange({ victims: [...(card?.victims ?? []), {}] });
  };

  const removeVictim = (index: number) => {
    onChange({
      victims: (card?.victims ?? []).filter(
        (_victim, victimIndex) => victimIndex !== index,
      ),
    });
  };

  const sessionLabel = trainingSessionId
    ? `Сессия · ${trainingSessionId.slice(-8).toUpperCase()}`
    : "Ожидание вызова";

  return (
    <aside className="operator-caller-column flex min-h-0 flex-col gap-2">
      <Section className="arm-caller-summary shrink-0">
        <Flex align="center" justify="between" gap="2">
          <Text size="3" weight="bold">
            {sessionLabel}
          </Text>
          <Text size="1" color="gray" className="tabular-nums">
            {startedAt?.toLocaleString("ru-RU") ?? "Нет активного вызова"}
          </Text>
        </Flex>
        <Info label="Источник" value="Телефонный звонок" />
        <Info label="Взял в работу" value={operatorName} />
        <Separator className="my-3" size="4" />
        <Text size="2" weight="bold">
          Абонент
        </Text>
        <Info label="Телефон" value={callerNumber ?? "Не определён"} />
        <Info label="ФИО" value="Нет данных" />
      </Section>

      <Section className="arm-caller-details shrink-0">
        <Flex align="center" justify="between" gap="2">
          <Text size="2" weight="bold">
            Заявитель
          </Text>
          <Text as="label" size="1" color="gray">
            <Flex align="center" gap="1">
              <Checkbox
                size="1"
                checked={card?.callerAnonymous ?? false}
                disabled={disabled || !card}
                onCheckedChange={(checked) =>
                  onChange({ callerAnonymous: checked === true })
                }
              />
              Анонимный заявитель
            </Flex>
          </Text>
        </Flex>
        <div className="person-name-grid mt-3 grid gap-2 min-[1480px]:!grid-cols-3">
          <Field
            label="Фамилия"
            placeholder="Введите фамилию"
            value={card?.callerLastName ?? ""}
            disabled={disabled || !card}
            onChange={(value) => onChange({ callerLastName: value })}
          />
          <Field
            label="Имя"
            placeholder="Введите имя"
            value={card?.callerFirstName ?? ""}
            disabled={disabled || !card}
            onChange={(value) => onChange({ callerFirstName: value })}
          />
          <Field
            label="Отчество"
            placeholder="Введите отчество"
            value={card?.callerMiddleName ?? ""}
            disabled={disabled || !card}
            onChange={(value) => onChange({ callerMiddleName: value })}
          />
        </div>
        <div className="person-contact-grid mt-3 grid items-end gap-2 min-[1480px]:!grid-cols-2">
          <FieldLabel label="Язык">
            <Select.Root
              value={card?.callerLanguage ?? ""}
              size="1"
              disabled={disabled || !card}
              onValueChange={(value) => onChange({ callerLanguage: value })}
            >
              <Select.Trigger className="w-full" placeholder="Выберите язык" />
              <Select.Content>
                {CALLER_LANGUAGE_OPTIONS.map((language) => (
                  <Select.Item key={language} value={language}>
                    {language}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </FieldLabel>
          <FieldLabel label="Номер телефона">
            <PhoneField.Root
              size="1"
              country="ru"
              value={card?.callerPhone ?? ""}
              disabled={disabled || !card}
              onChange={(value) => onChange({ callerPhone: value })}
              preferredCountries={["ru", "az"]}
            />
          </FieldLabel>
        </div>
      </Section>

      <Section className="arm-victims-panel min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col gap-3">
          <Text size="2" weight="bold">
            Пострадавшие
          </Text>
          <div className="h-0 min-h-0 flex-1">
            <ScrollArea
              className="h-full min-h-0"
              size="1"
              type="auto"
              scrollbars="vertical"
              ref={victimsListRef}
              tabIndex={0}
              aria-label="Список пострадавших"
            >
              <div className="grid w-full min-w-0 content-start gap-3 pr-3">
                {victims.length === 0 ? (
                  <Text as="p" size="1" color="gray">
                    Пострадавшие не добавлены. Если есть пострадавший, нажмите
                    кнопку ниже и заполните известные сведения.
                  </Text>
                ) : (
                  victims.map((victim, index) => (
                    <VictimFields
                      key={index}
                      victim={victim}
                      index={index}
                      canRemove
                      disabled={disabled || !card}
                      onChange={updateVictim}
                      onRemove={removeVictim}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
          <Button
            type="button"
            size="1"
            variant="soft"
            className="w-full"
            disabled={disabled || !card || card.victims.length >= 20}
            onClick={addVictim}
          >
            <Plus size={14} /> Добавить пострадавшего
          </Button>
        </div>
      </Section>
    </aside>
  );
}

function VictimFields({
  victim,
  index,
  canRemove,
  disabled,
  onChange,
  onRemove,
}: {
  victim: IncidentCardVictim;
  index: number;
  canRemove: boolean;
  disabled: boolean;
  onChange: <K extends keyof IncidentCardVictim>(
    index: number,
    field: K,
    value: IncidentCardVictim[K],
  ) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section aria-label={`Пострадавший ${index + 1}`}>
      {index > 0 && <Separator className="mb-3" size="4" />}
      {canRemove && (
        <Flex align="center" justify="between" mb="2">
          <Text size="1" color="gray" weight="medium">
            Пострадавший {index + 1}
          </Text>
          <IconButton
            type="button"
            size="1"
            variant="ghost"
            color="red"
            disabled={disabled}
            aria-label={`Удалить пострадавшего ${index + 1}`}
            onClick={() => onRemove(index)}
          >
            <Trash2 size={14} />
          </IconButton>
        </Flex>
      )}
      <div className="person-name-grid grid gap-2 min-[1480px]:!grid-cols-3">
        <Field
          label="Фамилия"
          placeholder="Введите фамилию"
          value={victim.lastName ?? ""}
          disabled={disabled}
          onChange={(value) => onChange(index, "lastName", value)}
        />
        <Field
          label="Имя"
          placeholder="Введите имя"
          value={victim.firstName ?? ""}
          disabled={disabled}
          onChange={(value) => onChange(index, "firstName", value)}
        />
        <Field
          label="Отчество"
          placeholder="Введите отчество"
          value={victim.middleName ?? ""}
          disabled={disabled}
          onChange={(value) => onChange(index, "middleName", value)}
        />
      </div>
      <div className="victim-meta-grid mt-3 grid gap-2 min-[1480px]:!grid-cols-2">
        <FieldLabel label="Повод вызова">
          <Select.Root
            value={victim.reason ?? ""}
            onValueChange={(value) => onChange(index, "reason", value)}
            size="1"
            disabled={disabled}
          >
            <Select.Trigger className="w-full" placeholder="Выберите" />
            <Select.Content>
              <Select.Item value="Травма">Травма</Select.Item>
              <Select.Item value="Угроза жизни">Угроза жизни</Select.Item>
              <Select.Item value="Другое">Другое</Select.Item>
            </Select.Content>
          </Select.Root>
        </FieldLabel>
        <FieldLabel label="Дата рождения">
          <DatePicker
            size="1"
            placeholder="дд.мм.гггг"
            value={toDate(victim.birthDate)}
            disabled={disabled}
            onChange={(value) =>
              onChange(index, "birthDate", toDateOnly(value))
            }
          />
        </FieldLabel>
      </div>
      <FieldLabel label="Доп. информация" className="mt-2">
        <TextArea
          size="1"
          rows={3}
          placeholder="Напишите…"
          value={victim.notes ?? ""}
          disabled={disabled}
          onChange={(event) =>
            onChange(index, "notes", event.currentTarget.value)
          }
        />
      </FieldLabel>
    </section>
  );
}

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      size="2"
      variant="classic"
      className={`arm-operator-section ${className}`}
    >
      {children}
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1 flex min-w-0 gap-1 text-xs">
      <span className="text-gray-11 shrink-0 font-semibold">{label}:</span>
      <span className="text-gray-11 min-w-0" title={value}>
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  disabled,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FieldLabel label={label}>
      <TextField.Root
        size="1"
        className="w-full"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </FieldLabel>
  );
}

function FieldLabel({
  children,
  className = "",
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <label className={`text-gray-11 grid min-w-0 gap-1 text-xs ${className}`}>
      {label}
      {children}
    </label>
  );
}
