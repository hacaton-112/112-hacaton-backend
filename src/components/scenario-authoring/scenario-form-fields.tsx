import {
  Card,
  Checkbox,
  Flex,
  Text,
  TextArea,
  TextField,
} from "@bolid-ui/themes";
import type { ReactNode } from "react";

export function SectionCard({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card size="3" variant="classic">
      <Flex align="start" justify="between" gap="4" mb="4">
        <div>
          <Text as="div" size="4" weight="bold">
            {title}
          </Text>
          {description && (
            <Text as="p" size="2" color="gray" mt="1">
              {description}
            </Text>
          )}
        </div>
        {actions}
      </Flex>
      {children}
    </Card>
  );
}

export function FieldLabel({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`text-gray-11 grid min-w-0 gap-1 text-xs ${className}`}>
      <span>
        {label}
        {hint && <span className="text-gray-9 ml-1">· {hint}</span>}
      </span>
      {children}
    </label>
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
  rows = 3,
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
    <FieldLabel label={label} hint={hint} className={className}>
      <select
        className="border-grayA-6 bg-panel text-gray-12 focus:border-blue-8 h-9 w-full rounded-md border px-2 text-sm outline-none"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldLabel>
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
