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
  Skeleton,
  Text,
  TextArea,
  TextField,
} from "@bolid-ui/themes";
import { CirclePlus, Trash2 } from "lucide-react";
import { use, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import {
  ScenarioFormLoadingContext,
  useFieldError,
} from "./scenario-form-context";

/** Поле или кнопка формы: пока черновик собирается, вместо них скелетон. */
export function Loadable({ children }: { children: ReactNode }) {
  const loading = use(ScenarioFormLoadingContext);

  return <Skeleton loading={loading}>{children}</Skeleton>;
}

/** Подпись ошибки под полем. */
export function FieldError({ error }: { error: string | undefined }) {
  if (error === undefined) return null;

  return (
    <Text as="span" size="1" color="red" role="alert">
      {error}
    </Text>
  );
}

/**
 * Карточка раздела конструктора: заголовок, пояснение и действие справа.
 *
 * В макете у всех разделов одна шапка — жирный заголовок и строка пояснения
 * под ним, а кнопка «+ Факт» прижата вправо на уровне заголовка.
 *
 * `errorPath` — ошибка всего списка раздела, например неуникальные ключи
 * фактов: ни одному полю в отдельности она не принадлежит.
 */
export function SectionCard({
  title,
  description,
  actions,
  errorPath,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  errorPath?: string;
  children?: ReactNode;
}) {
  const { error, anchor } = useFieldError(errorPath, true);

  return (
    <Card size="3" variant="classic" {...anchor}>
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
          <FieldError error={error} />
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
    <Loadable>
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
    </Loadable>
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
    <Loadable>
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
    </Loadable>
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

/**
 * Подпись над полем, как в макете: серая строка 14px, поле сразу под ней, а
 * ошибка проверки — красной строкой под полем.
 */
export function FieldLabel({
  label,
  hint,
  path,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  path?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Text
      as="label"
      size="2"
      color="gray"
      className={cn("grid min-w-0 content-start gap-0.5", className)}
      data-field-path={path}
      data-field-invalid={error === undefined ? undefined : "true"}
    >
      <span>
        {label}
        {hint && ` (${hint})`}
      </span>
      {children}
      <FieldError error={error} />
    </Text>
  );
}

export function TextInput({
  label,
  path,
  value,
  onChange,
  placeholder,
  hint,
  maxLength,
  className,
  disabled = false,
}: {
  label: string;
  path?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  className?: string;
  disabled?: boolean;
}) {
  const { error, clear } = useFieldError(path);

  return (
    <FieldLabel
      label={label}
      hint={hint}
      path={path}
      error={error}
      className={className}
    >
      <Loadable>
        <TextField.Root
          size="2"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error !== undefined}
          onChange={(event) => {
            clear();
            onChange(event.currentTarget.value);
          }}
        />
      </Loadable>
    </FieldLabel>
  );
}

export function TextAreaInput({
  label,
  path,
  value,
  onChange,
  placeholder,
  hint,
  rows = 2,
  maxLength,
  className,
}: {
  label: string;
  path?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
}) {
  const { error, clear } = useFieldError(path);

  return (
    <FieldLabel
      label={label}
      hint={hint}
      path={path}
      error={error}
      className={className}
    >
      <Loadable>
        <TextArea
          size="2"
          rows={rows}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={error !== undefined}
          onChange={(event) => {
            clear();
            onChange(event.currentTarget.value);
          }}
        />
      </Loadable>
    </FieldLabel>
  );
}

export function NumberInput({
  label,
  path,
  value,
  onChange,
  min,
  max,
  step,
  hint,
  className,
}: {
  label: string;
  path?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  className?: string;
}) {
  const { error, clear } = useFieldError(path);

  return (
    <FieldLabel
      label={label}
      hint={hint}
      path={path}
      error={error}
      className={className}
    >
      <Loadable>
        <TextField.Root
          size="2"
          type="number"
          value={String(value)}
          min={min}
          max={max}
          step={step}
          aria-invalid={error !== undefined}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            if (!Number.isFinite(next)) return;
            clear();
            onChange(next);
          }}
        />
      </Loadable>
    </FieldLabel>
  );
}

export function SelectInput<T extends string>({
  label,
  path,
  value,
  options,
  onChange,
  hint,
  className,
}: {
  label: string;
  path?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
  className?: string;
}) {
  const { error, clear, anchor } = useFieldError(path);

  return (
    // Подпись не оборачивает Select: клик по <label> открывал бы список
    // вторым событием, и он тут же закрывался.
    <Grid
      className={cn("min-w-0 content-start gap-0.5", className)}
      {...anchor}
    >
      <Text size="2" color="gray">
        {label}
        {hint && ` (${hint})`}
      </Text>
      <Select.Root
        size="2"
        value={value}
        onValueChange={(next) => {
          clear();
          onChange(next as T);
        }}
      >
        <Loadable>
          <Select.Trigger
            aria-label={label}
            aria-invalid={error !== undefined}
            className="w-full"
          />
        </Loadable>
        <Select.Content position="popper">
          {options.map((option) => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      <FieldError error={error} />
    </Grid>
  );
}

export function BooleanInput({
  label,
  path,
  checked,
  onChange,
}: {
  label: string;
  path?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { error, clear, anchor } = useFieldError(path);

  return (
    <Text as="label" size="2" color="gray" className="grid gap-0.5" {...anchor}>
      <Flex align="center" gap="2">
        <Loadable>
          <Checkbox
            checked={checked}
            aria-invalid={error !== undefined}
            onCheckedChange={(value) => {
              clear();
              onChange(value === true);
            }}
          />
        </Loadable>
        {label}
      </Flex>
      <FieldError error={error} />
    </Text>
  );
}

/** Набор вариантов-чипов, как «Ожидаемые службы» в макете. */
export function ChipsInput<T extends string>({
  label,
  path,
  value,
  options,
  onChange,
}: {
  label: string;
  path?: string;
  value: readonly T[];
  options: readonly { value: T; label: string }[];
  onChange: (value: T[]) => void;
}) {
  const { error, clear, anchor } = useFieldError(path);

  return (
    <Grid gap="2" {...anchor}>
      <Text size="2" color="gray">
        {label}
      </Text>
      <Loadable>
        <CheckboxCards.Root
          size="1"
          gap="2"
          value={[...value]}
          aria-invalid={error !== undefined}
          onValueChange={(next) => {
            clear();
            onChange(next as T[]);
          }}
          className="flex! flex-wrap"
        >
          {options.map((option) => (
            <CheckboxCards.Item key={option.value} value={option.value}>
              <Text size="2">{option.label}</Text>
            </CheckboxCards.Item>
          ))}
        </CheckboxCards.Root>
      </Loadable>
      <FieldError error={error} />
    </Grid>
  );
}
