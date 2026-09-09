import {
  Badge,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Flex,
  IconButton,
  PhoneField,
  Select,
  Text,
  TextArea,
  TextField,
} from "@bolid-ui/themes";
import { LocateFixed, Phone, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import type { CallSnapshot } from "../../hooks/use-call";

interface VictimDraft {
  id: number;
  lastName: string;
  firstName: string;
  middleName: string;
  reason: string;
  birthDate: Date | null;
  details: string;
}

const createVictim = (id: number): VictimDraft => ({
  id,
  lastName: "",
  firstName: "",
  middleName: "",
  reason: "none",
  birthDate: null,
  details: "",
});

export function CallerPanel({
  callerNumber,
  startedAt,
}: Pick<CallSnapshot, "callerNumber" | "startedAt">) {
  const [editedPhone, setEditedPhone] = useState<string | null>(null);
  const nextVictimId = useRef(2);
  const [victims, setVictims] = useState<VictimDraft[]>([createVictim(1)]);
  const applicantPhone = editedPhone ?? callerNumber?.replace(/\D/g, "") ?? "";

  const updateVictim = <K extends keyof Omit<VictimDraft, "id">>(
    id: number,
    field: K,
    value: VictimDraft[K],
  ) => {
    setVictims((current) =>
      current.map((victim) =>
        victim.id === id ? { ...victim, [field]: value } : victim,
      ),
    );
  };

  const addVictim = () => {
    const id = nextVictimId.current;
    nextVictimId.current += 1;
    setVictims((current) => [...current, createVictim(id)]);
  };

  const removeVictim = (id: number) => {
    setVictims((current) => current.filter((victim) => victim.id !== id));
  };

  return (
    <aside className="operator-caller-column grid min-h-full content-start gap-4">
      <Section>
        <Flex align="center" justify="between" gap="2">
          <Text size="3" weight="bold">
            УКИО - 8921
          </Text>
          <Text size="1" color="gray" className="tabular-nums">
            {startedAt?.toLocaleString("ru-RU") ?? "Ожидание вызова"}
          </Text>
        </Flex>
        <Flex align="center" gap="1" mt="2" wrap="wrap">
          <Badge color="amber" variant="soft">
            Подключение ДДС
          </Badge>
          <Badge color="orange" variant="soft">
            Связанное обращение
          </Badge>
        </Flex>
        <Info label="Источник" value="Телефонный звонок" />
        <Info label="Взял в работу" value="580208  Манаев Е.Л." />
        <Info label="Работает с УКИО" value="580208  Манаев Е.Л." />
        <div className="bg-grayA-4 my-3 h-px" />
        <Flex align="center" justify="between">
          <Text size="2" weight="bold">
            Абонент
          </Text>
          <Flex gap="1">
            <MiniButton label="Показать на карте">
              <LocateFixed size={14} />
            </MiniButton>
            <MiniButton label="Позвонить абоненту">
              <Phone size={14} />
            </MiniButton>
          </Flex>
        </Flex>
        <Info label="ФИО" value="Максутов Александр Петрович" />
        <Info label="Телефон" value={callerNumber ?? "+7 (916) 204-31-77"} />
        <Info label="Дата рождения" value="00.00.0000" />
        <Info
          label="Регистрация"
          value="РБ, г. Уфа, ул. 8 Марта, д. 8, кв. 306"
        />
      </Section>

      <Section>
        <Flex align="center" justify="between" gap="2">
          <Text size="2" weight="bold">
            Заявитель
          </Text>
          <Text as="label" size="1" color="gray">
            <Flex align="center" gap="1">
              <Checkbox size="1" /> Анонимный заявитель
            </Flex>
          </Text>
        </Flex>
        <div className="person-name-grid mt-3 grid gap-2">
          <Field label="Фамилия" placeholder="Введите фамилию" />
          <Field label="Имя" placeholder="Введите имя" />
          <Field label="Отчество" placeholder="Введите отчество" />
        </div>
        <div className="person-contact-grid mt-3 grid items-end gap-2">
          <FieldLabel label="Язык">
            <Select.Root defaultValue="ru" size="1">
              <Select.Trigger className="w-full" />
              <Select.Content>
                <Select.Item value="ru">Русский</Select.Item>
              </Select.Content>
            </Select.Root>
          </FieldLabel>
          <FieldLabel label="Номер телефона">
            <PhoneField.Root
              size="1"
              country="ru"
              value={applicantPhone}
              onChange={(value) => setEditedPhone(value)}
              preferredCountries={["ru", "az"]}
            />
          </FieldLabel>
        </div>
      </Section>

      <Section>
        <Text size="2" weight="bold">
          Пострадавшие
        </Text>
        <div className="grid gap-3">
          {victims.map((victim, index) => (
            <VictimFields
              key={victim.id}
              victim={victim}
              index={index}
              canRemove={victims.length > 1}
              onChange={updateVictim}
              onRemove={removeVictim}
            />
          ))}
        </div>
        <Button
          type="button"
          size="1"
          variant="ghost"
          mt="2"
          onClick={addVictim}
        >
          <Plus size={14} /> Добавить
        </Button>
      </Section>
    </aside>
  );
}

function VictimFields({
  victim,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  victim: VictimDraft;
  index: number;
  canRemove: boolean;
  onChange: <K extends keyof Omit<VictimDraft, "id">>(
    id: number,
    field: K,
    value: VictimDraft[K],
  ) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <section
      className={index === 0 ? "mt-3" : "border-grayA-5 border-t pt-3"}
      aria-label={`Пострадавший ${index + 1}`}
    >
      {(canRemove || index > 0) && (
        <Flex align="center" justify="between" mb="2">
          <Text size="1" color="gray" weight="medium">
            Пострадавший {index + 1}
          </Text>
          <IconButton
            type="button"
            size="1"
            variant="ghost"
            color="red"
            aria-label={`Удалить пострадавшего ${index + 1}`}
            onClick={() => onRemove(victim.id)}
          >
            <Trash2 size={14} />
          </IconButton>
        </Flex>
      )}
      <div className="person-name-grid grid gap-2">
        <Field
          label="Фамилия"
          placeholder="Введите фамилию"
          value={victim.lastName}
          onChange={(value) => onChange(victim.id, "lastName", value)}
        />
        <Field
          label="Имя"
          placeholder="Введите имя"
          value={victim.firstName}
          onChange={(value) => onChange(victim.id, "firstName", value)}
        />
        <Field
          label="Отчество"
          placeholder="Введите отчество"
          value={victim.middleName}
          onChange={(value) => onChange(victim.id, "middleName", value)}
        />
      </div>
      <div className="victim-meta-grid mt-3 grid gap-2">
        <FieldLabel label="Повод вызова">
          <Select.Root
            value={victim.reason}
            onValueChange={(value) => onChange(victim.id, "reason", value)}
            size="1"
          >
            <Select.Trigger className="w-full" />
            <Select.Content>
              <Select.Item value="none">Выберите</Select.Item>
              <Select.Item value="injury">Травма</Select.Item>
              <Select.Item value="danger">Угроза жизни</Select.Item>
            </Select.Content>
          </Select.Root>
        </FieldLabel>
        <FieldLabel label="Дата рождения">
          <DatePicker
            size="1"
            placeholder="дд.мм.гггг"
            value={victim.birthDate}
            onChange={(value) => {
              const birthDate =
                value instanceof Date
                  ? value
                  : value
                    ? new Date(value.year, value.month - 1, value.day)
                    : null;
              onChange(victim.id, "birthDate", birthDate);
            }}
          />
        </FieldLabel>
      </div>
      <FieldLabel label="Доп. информация" className="mt-2">
        <TextArea
          size="1"
          rows={3}
          placeholder="Напишите…"
          value={victim.details}
          onChange={(event) =>
            onChange(victim.id, "details", event.currentTarget.value)
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
    <Card size="2" variant="classic" className={className}>
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
  onChange,
}: {
  label: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <FieldLabel label={label}>
      <TextField.Root
        size="1"
        className="w-full"
        placeholder={placeholder}
        value={value}
        onChange={
          onChange ? (event) => onChange(event.currentTarget.value) : undefined
        }
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

function MiniButton({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <IconButton
      type="button"
      title={label}
      aria-label={label}
      size="1"
      radius="full"
      color="gray"
      variant="soft"
    >
      {children}
    </IconButton>
  );
}
