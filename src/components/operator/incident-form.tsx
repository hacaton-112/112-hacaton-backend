import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  Flex,
  NumberField,
  Select,
  Text,
  TextArea,
  TextField,
} from "@bolid-ui/themes";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_PRIORITY_LABELS,
  type IncidentCard,
  type IncidentCardInput,
  IncidentCardSchema,
} from "../../contracts/incident";
import { FormField } from "../auth/form-field";
import { DuplicateSuspicion } from "./duplicate-suspicion";

const EMPTY_CARD: IncidentCardInput = {
  category: "other",
  address: "",
  apartment: "",
  landmark: "",
  callerName: "",
  callerPhone: "",
  callerRole: "witness",
  threatToLife: false,
  victimsCount: 0,
  services: ["police"],
  priority: "normal",
  description: "",
};

interface IncidentFormProps {
  /** Адрес, определённый по вызову: подставляется в поле, но остаётся редактируемым. */
  resolvedAddress?: string;
  resolvedLatitude?: number;
  resolvedLongitude?: number;
  callerPhone?: string;
  disabled?: boolean;
  onSubmit?: (card: IncidentCard) => void;
}

export function IncidentForm({
  resolvedAddress,
  resolvedLatitude,
  resolvedLongitude,
  callerPhone,
  disabled = false,
  onSubmit,
}: IncidentFormProps) {
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<IncidentCardInput, unknown, IncidentCard>({
    resolver: zodResolver(IncidentCardSchema),
    defaultValues: EMPTY_CARD,
  });

  useEffect(() => {
    if (resolvedAddress) setValue("address", resolvedAddress);
  }, [resolvedAddress, setValue]);

  useEffect(() => {
    if (callerPhone) setValue("callerPhone", callerPhone);
  }, [callerPhone, setValue]);

  return (
    <form
      className="grid content-start gap-4"
      onSubmit={handleSubmit((card) => onSubmit?.(card))}
      noValidate
    >
      <Card size="2" variant="classic" aria-labelledby="location-title">
        <Text id="location-title" size="2" weight="bold">
          Место происшествия
        </Text>

        <FormField
          label="Адрес (улица, дом, корпус, строение, владение, дорога, километр, метр, адресный участок, объект)"
          htmlFor="address"
          error={errors.address?.message}
        >
          <TextField.Root
            id="address"
            size="1"
            placeholder="Введите адрес"
            disabled={disabled}
            {...register("address")}
          />
        </FormField>

        <div className="incident-pair-grid mt-3 grid gap-2">
          <SelectField
            label="Район"
            placeholder="Выберите район"
            disabled={disabled}
          />
          <SelectField
            label="Объект"
            placeholder="Выберите объект"
            disabled={disabled}
          />
        </div>

        <div className="location-details-grid mt-3 grid gap-3">
          <FormField
            label="Подъезд"
            htmlFor="apartment"
            error={errors.apartment?.message}
          >
            <TextField.Root
              id="apartment"
              size="1"
              placeholder="Введите подъезд"
              disabled={disabled}
              {...register("apartment")}
            />
          </FormField>
          <CompactField
            label="Этаж"
            placeholder="Введите этаж"
            disabled={disabled}
          />
          <CompactField
            label="Домофон"
            placeholder="Введите домофон"
            disabled={disabled}
          />
          <CompactField
            label="Широта"
            placeholder="Введите широту"
            value={resolvedLatitude?.toFixed(6)}
            disabled={disabled}
          />
          <CompactField
            label="Долгота"
            placeholder="Введите долготу"
            value={resolvedLongitude?.toFixed(6)}
            disabled={disabled}
          />
          <Text as="label" size="1" color="gray" className="self-end pb-1">
            <Flex align="center" gap="1">
              <Checkbox size="1" disabled={disabled} /> Район
            </Flex>
          </Text>
        </div>

        <FormField
          label="Доп. информация"
          htmlFor="landmark"
          error={errors.landmark?.message}
        >
          <TextArea
            id="landmark"
            size="1"
            rows={2}
            placeholder="Напишите…"
            disabled={disabled}
            {...register("landmark")}
          />
        </FormField>
      </Card>

      <Card size="2" variant="classic" aria-labelledby="incident-title">
        <Text id="incident-title" size="2" weight="bold">
          О происшествии
        </Text>

        <FormField
          label="Тип происшествия"
          htmlFor="category"
          error={errors.category?.message}
        >
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <Select.Root
                size="1"
                value={field.value}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <Select.Trigger
                  id="category"
                  className="w-full"
                  placeholder="Выберите тип"
                />
                <Select.Content>
                  {Object.entries(INCIDENT_CATEGORY_LABELS).map(
                    ([value, label]) => (
                      <Select.Item key={value} value={value}>
                        {label}
                      </Select.Item>
                    ),
                  )}
                </Select.Content>
              </Select.Root>
            )}
          />
        </FormField>

        <div className="incident-meta-grid mt-3 grid items-end gap-2">
          <div className="min-w-0">
            <Text size="1" color="gray">
              Категория
            </Text>
            <Flex gap="1" mt="1" wrap="wrap">
              <Tag>Социально-значимое</Tag>
              <Controller
                control={control}
                name="threatToLife"
                render={({ field }) => (
                  <Tag
                    active={field.value}
                    onClick={() => field.onChange(!field.value)}
                    disabled={disabled}
                  >
                    Угроза людям
                  </Tag>
                )}
              />
              <Tag>Угроза ЧС</Tag>
              <Tag>Важно</Tag>
            </Flex>
          </div>
          <FormField
            label=""
            htmlFor="priority"
            error={errors.priority?.message}
          >
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Select.Root
                  size="1"
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <Select.Trigger id="priority" className="w-full" />
                  <Select.Content>
                    {Object.entries(INCIDENT_PRIORITY_LABELS).map(
                      ([value, label]) => (
                        <Select.Item key={value} value={value}>
                          {label}
                        </Select.Item>
                      ),
                    )}
                  </Select.Content>
                </Select.Root>
              )}
            />
          </FormField>
          <DatePicker size="1" placeholder="дд.мм.гггг" disabled={disabled} />
        </div>

        <div className="incident-counts-grid mt-3 grid gap-3">
          <FormField
            label="Пострадавшие"
            htmlFor="victimsCount"
            error={errors.victimsCount?.message}
          >
            <Controller
              control={control}
              name="victimsCount"
              render={({ field }) => (
                <NumberField.Root
                  id="victimsCount"
                  size="1"
                  className="w-full"
                  placeholder="Введите кол-во"
                  value={Number(field.value)}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  minValue={0}
                  maxValue={999}
                  disabled={disabled}
                />
              )}
            />
          </FormField>
          <CountField
            id="child-victims"
            label="Из них детей"
            disabled={disabled}
          />
          <CountField id="fatalities" label="Погибшие" disabled={disabled} />
          <CountField
            id="child-fatalities"
            label="Из них детей"
            disabled={disabled}
          />
        </div>

        <FormField
          label="Описание со слов заявителя"
          htmlFor="description"
          error={errors.description?.message}
        >
          <TextArea
            id="description"
            size="1"
            rows={2}
            placeholder="Напишите…"
            disabled={disabled}
            {...register("description")}
          />
        </FormField>
      </Card>

      <DuplicateSuspicion />
    </form>
  );
}

function SelectField({
  label,
  placeholder,
  disabled,
}: {
  label: string;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <FormField label={label} htmlFor={`select-${label}`}>
      <Select.Root defaultValue="none" size="1" disabled={disabled}>
        <Select.Trigger
          id={`select-${label}`}
          className="w-full"
          placeholder={placeholder}
        />
        <Select.Content>
          <Select.Item value="none">{placeholder}</Select.Item>
          <Select.Item value="selected">Выбрано</Select.Item>
        </Select.Content>
      </Select.Root>
    </FormField>
  );
}

function CompactField({
  label,
  placeholder,
  value,
  disabled,
}: {
  label: string;
  placeholder: string;
  value?: string;
  disabled: boolean;
}) {
  return (
    <FormField label={label} htmlFor={`field-${label}`}>
      <TextField.Root
        id={`field-${label}`}
        size="1"
        placeholder={placeholder}
        value={value}
        readOnly={value !== undefined}
        disabled={disabled}
      />
    </FormField>
  );
}

function CountField({
  id,
  label,
  disabled,
}: {
  id: string;
  label: string;
  disabled: boolean;
}) {
  return (
    <FormField label={label} htmlFor={id}>
      <NumberField.Root
        id={id}
        size="1"
        className="w-full"
        placeholder="Введите кол-во"
        minValue={0}
        disabled={disabled}
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
      color={active ? "red" : "gray"}
      variant="soft"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
