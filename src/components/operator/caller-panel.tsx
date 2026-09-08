import {
  Badge,
  Button,
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
import { Check, Copy, LocateFixed, MoreVertical, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { CallSnapshot } from "../../hooks/use-call";

export function CallerPanel({
  callerNumber,
  startedAt,
}: Pick<CallSnapshot, "callerNumber" | "startedAt">) {
  const [editedPhone, setEditedPhone] = useState<string | null>(null);
  const applicantPhone = editedPhone ?? callerNumber?.replace(/\D/g, "") ?? "";

  return (
    <aside className="border-grayA-5 bg-background min-h-full border-r">
      <Section className="pt-3">
        <Flex align="center" justify="between" gap="2">
          <Text size="3" weight="bold">
            УКИО · 8921
          </Text>
          <Text size="1" color="gray" className="tabular-nums">
            {startedAt?.toLocaleString("ru-RU") ?? "Ожидание вызова"}
          </Text>
        </Flex>
        <Flex align="center" justify="between" mt="2">
          <Badge color="amber" variant="soft">
            Подключение ДДС
          </Badge>
          <Badge color="blue" variant="soft">
            Связанное обращение
          </Badge>
        </Flex>
        <Info label="Источник" value="Телефонный звонок" />
        <Info label="Взял в работу" value="580208  Манаев Е.Л." />
        <Info label="Работает с УКИО" value="580208  Манаев Е.Л." />
      </Section>

      <Section>
        <Flex align="center" justify="between">
          <Text size="2" weight="bold">
            Абонент
          </Text>
          <Flex gap="1">
            <MiniButton label="Показать на карте">
              <LocateFixed size={14} />
            </MiniButton>
            <MiniButton label="Дополнительные действия">
              <MoreVertical size={14} />
            </MiniButton>
          </Flex>
        </Flex>
        <Info label="ФИО" value="Максутов Александр Петрович" />
        <Info label="Телефон" value={callerNumber ?? "+7 (916) 204-31-77"} />
        <Info
          label="Регистрация"
          value="г. Москва, ул. 8 Марта, д. 8, кв. 306"
        />
      </Section>

      <Section>
        <Text size="2" weight="bold">
          Заявитель
        </Text>
        <Text as="label" size="1" color="gray">
          <Flex align="center" gap="2" mt="2">
            <Checkbox size="1" /> Анонимный заявитель
          </Flex>
        </Text>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Field label="Фамилия" placeholder="Фамилия" />
          <Field label="Имя" placeholder="Имя" />
          <Field label="Отчество" placeholder="Отчество" />
        </div>
        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
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
          <IconButton
            type="button"
            size="1"
            radius="full"
            color="green"
            aria-label="Позвонить заявителю"
          >
            <Phone size={14} />
          </IconButton>
        </div>
      </Section>

      <Section>
        <Text size="2" weight="bold">
          Пострадавшие
        </Text>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Field label="Фамилия" placeholder="Фамилия" />
          <Field label="Имя" placeholder="Имя" />
          <Field label="Отчество" placeholder="Отчество" />
        </div>
        <div className="mt-2 grid grid-cols-[1fr_110px] gap-2">
          <FieldLabel label="Повод вызова">
            <Select.Root defaultValue="none" size="1">
              <Select.Trigger className="w-full" />
              <Select.Content>
                <Select.Item value="none">Выберите</Select.Item>
                <Select.Item value="injury">Травма</Select.Item>
                <Select.Item value="danger">Угроза жизни</Select.Item>
              </Select.Content>
            </Select.Root>
          </FieldLabel>
          <FieldLabel label="Дата рождения">
            <DatePicker size="1" placeholder="дд.мм.гггг" />
          </FieldLabel>
        </div>
        <FieldLabel label="Доп. информация" className="mt-2">
          <TextArea size="1" rows={3} placeholder="Напишите…" />
        </FieldLabel>
        <Button type="button" size="1" variant="ghost" mt="2">
          Добавить&nbsp; +
        </Button>
      </Section>
    </aside>
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
    <section className={`border-grayA-4 border-b px-3 pb-3 ${className}`}>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 grid grid-cols-[92px_1fr] gap-2 text-xs">
      <span className="text-gray-10">{label}:</span>
      <span className="text-gray-12 truncate font-medium" title={value}>
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
}: {
  label: string;
  placeholder?: string;
  value?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimerRef = useRef<number>(null);
  const [copied, setCopied] = useState(false);

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  const copyValue = async () => {
    const currentValue = inputRef.current?.value ?? "";

    try {
      await navigator.clipboard.writeText(currentValue);
      setCopied(true);

      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        resetTimerRef.current = null;
      }, 1_500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <FieldLabel label={label}>
      <TextField.Root
        ref={inputRef}
        size="1"
        className="w-full"
        placeholder={placeholder}
        defaultValue={value}
      >
        <TextField.Slot side="right">
          <IconButton
            type="button"
            size="1"
            variant="ghost"
            color={copied ? "green" : "gray"}
            className="cursor-pointer"
            aria-label={copied ? "Скопировано" : `Скопировать поле «${label}»`}
            onClick={() => void copyValue()}
          >
            {copied ? (
              <Check size={13} aria-hidden />
            ) : (
              <Copy size={13} aria-hidden />
            )}
          </IconButton>
        </TextField.Slot>
      </TextField.Root>
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
