import {
  Badge,
  Button,
  Card,
  Checkbox,
  CheckboxCards,
  Flex,
  Grid,
  Heading,
  IconButton,
  Select,
  Text,
  TextArea,
  TextField,
} from "@bolid-ui/themes";
import { CirclePlus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * Карточка раздела конструктора: заголовок, пояснение и действие справа.
 *
 * В макете у всех разделов одна шапка — жирный заголовок и строка пояснения
 * под ним, а кнопка «+ Факт» прижата вправо на уровне заголовка.
 */
export function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card size="3" variant="classic">
      <Flex
        align="start"
        justify="between"
        gap="4"
        mb={children === undefined ? "0" : "4"}
      >
        <Grid gap="1" className="min-w-0">
          <Heading as="h2" size="3" weight="bold">
            {title}
          </Heading>
          {description !== undefined && (
            <Text as="div" size="2" color="gray">
              {description}
            </Text>
          )}
        </Grid>
        {actions}
      </Flex>
      {children}
    </Card>
  );
}

/** Кнопка «+ Факт», «+ Вопрос» в шапке раздела. */
export function AddButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="2"
      variant="soft"
      className="shrink-0"
      disabled={disabled}
      onClick={onClick}
    >
      <CirclePlus size={16} /> {children}
    </Button>
  );
}

/**
 * Элемент списка внутри раздела: факт, правило, поле эталона.
 *
 * Номер и название — в шапке блока, кнопка удаления — справа от неё.
 */
export function SectionItem({
  index,
  title,
  tone = "gray",
  onRemove,
  removeLabel,
  removeDisabled,
  children,
}: {
  index?: number;
  title?: string;
  tone?: "gray" | "red";
  onRemove?: () => void;
  removeLabel?: string;
  removeDisabled?: boolean;
  children: ReactNode;
}) {
  const hasHeader = index !== undefined || title !== undefined;

  return (
    <Card size="2" variant="surface">
      {(hasHeader || onRemove) && (
        <Flex align="center" justify="between" gap="3" mb="3">
          <Flex align="center" gap="2" className="min-w-0">
            {index !== undefined && (
              <Badge color={tone} variant="soft">
                {index + 1}
              </Badge>
            )}
            {title !== undefined && (
              <Text size="3" weight="bold" truncate>
                {title}
              </Text>
            )}
          </Flex>
          {onRemove && (
            <RemoveButton
              label={removeLabel}
              disabled={removeDisabled}
              onClick={onRemove}
            />
          )}
        </Flex>
      )}
      {children}
    </Card>
  );
}

export function RemoveButton({
  label,
  disabled,
  onClick,
}: {
  label?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <IconButton
      type="button"
      variant="ghost"
      color="gray"
      size="3"
      className="shrink-0"
      aria-label={label ?? "Удалить"}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 size={20} />
    </IconButton>
  );
}

/**
 * Сетка полей раздела. Колонки задаются для ширины от `md` и `lg`, а на узком
 * экране поля всегда встают в одну колонку.
 */
export function FieldGrid({
  md = "2",
  lg,
  children,
  className,
}: {
  md?: "1" | "2";
  lg?: "2" | "3" | "4";
  children: ReactNode;
  className?: string;
}) {
  return (
    <Grid
      gap="3"
      columns={{ initial: "1", md, lg: lg ?? md }}
      className={className}
    >
      {children}
    </Grid>
  );
}

/** Подпись над полем, как в макете: серая строка 14px, поле сразу под ней. */
export function FieldLabel({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Text
      as="label"
      size="2"
      color="gray"
      className={cn("grid min-w-0 gap-0.5", className)}
    >
      <span>
        {label}
        {hint && ` (${hint})`}
      </span>
      {children}
    </Text>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  maxLength,
  className,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <FieldLabel label={label} hint={hint} className={className}>
      <TextField.Root
        size="2"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </FieldLabel>
  );
}

export function TextAreaInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 2,
  maxLength,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
}) {
  return (
    <FieldLabel label={label} hint={hint} className={className}>
      <TextArea
        size="2"
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </FieldLabel>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  className?: string;
}) {
  return (
    <FieldLabel label={label} hint={hint} className={className}>
      <TextField.Root
        size="2"
        type="number"
        value={String(value)}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </FieldLabel>
  );
}

export function SelectInput<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  className,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
  className?: string;
}) {
  return (
    // Подпись не оборачивает Select: клик по <label> открывал бы список
    // вторым событием, и он тут же закрывался.
    <Grid className={cn("min-w-0 gap-0.5", className)}>
      <Text size="2" color="gray">
        {label}
        {hint && ` (${hint})`}
      </Text>
      <Select.Root
        size="2"
        value={value}
        onValueChange={(next) => onChange(next as T)}
      >
        <Select.Trigger aria-label={label} className="w-full" />
        <Select.Content position="popper">
          {options.map((option) => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Grid>
  );
}

export function BooleanInput({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Text as="label" size="2" color="gray">
      <Flex align="center" gap="2">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onChange(value === true)}
        />
        {label}
      </Flex>
    </Text>
  );
}

/** Набор вариантов-чипов, как «Ожидаемые службы» в макете. */
export function ChipsInput<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: readonly T[];
  options: readonly { value: T; label: string }[];
  onChange: (value: T[]) => void;
}) {
  return (
    <Grid gap="2">
      <Text size="2" color="gray">
        {label}
      </Text>
      <CheckboxCards.Root
        size="1"
        gap="2"
        value={[...value]}
        onValueChange={(next) => onChange(next as T[])}
        className="flex! flex-wrap"
      >
        {options.map((option) => (
          <CheckboxCards.Item key={option.value} value={option.value}>
            <Text size="2">{option.label}</Text>
          </CheckboxCards.Item>
        ))}
      </CheckboxCards.Root>
    </Grid>
  );
}
