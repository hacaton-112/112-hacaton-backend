import {
  Button,
  Card,
  Checkbox,
  Flex,
  NumberField,
  Select,
  Text,
  TextArea,
  TextField,
} from "@bolid-ui/themes";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
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
  INCIDENT_TYPE_OPTIONS,
  type IncidentCard,
  type IncidentCardInput,
  IncidentCardSchema,
} from "../../contracts/incident";
import { FormField } from "../auth/form-field";
import { DuplicateSuspicion } from "./duplicate-suspicion";

/** Те же три параметра, что у формы: вход, контекст резолвера и результат. */
type CardControl = Control<IncidentCardInput, unknown, IncidentCard>;

interface IncidentFormProps {
  /** Адрес, определённый по вызову: подставляется в поле, но остаётся редактируемым. */
  resolvedAddress?: string;
  resolvedLatitude?: number;
  resolvedLongitude?: number;
  disabled?: boolean;
  /** Карточка звонка: приходит с backend и переживает перезагрузку окна. */
  card?: IncidentCardInput;
  /** Вызывается на каждое изменение: карточка пишется по ходу разговора. */
  onChange?: (card: IncidentCard) => void;
}

export function IncidentForm({
  resolvedAddress,
  resolvedLatitude,
  resolvedLongitude,
  disabled = false,
  card,
  onChange,
}: IncidentFormProps) {
  const { control, register, reset, setValue, getValues } = useForm<
    IncidentCardInput,
    unknown,
    IncidentCard
  >({
    resolver: zodResolver(IncidentCardSchema),
    defaultValues: EMPTY_INCIDENT_CARD,
  });

  // Карточку присылает backend: она могла заполняться до перезагрузки окна.
  useEffect(() => {
    if (card) reset(card);
  }, [card, reset]);

  useEffect(() => {
    if (resolvedAddress) setValue("addressText", resolvedAddress);
  }, [resolvedAddress, setValue]);

  useEffect(() => {
    if (resolvedLatitude !== undefined) {
      setValue("latitude", resolvedLatitude.toFixed(6));
      setValue("longitude", (resolvedLongitude ?? 0).toFixed(6));
    }
  }, [resolvedLatitude, resolvedLongitude, setValue]);

  // Кнопки «сохранить» в АРМ нет: карточка уходит на сервер по ходу разговора,
  // а закрывает её конец звонка.
  const values = useWatch({ control });

  useEffect(() => {
    const parsed = IncidentCardSchema.safeParse(getValues());

    if (parsed.success) {
      onChange?.(parsed.data);
    }
  }, [values, getValues, onChange]);

  return (
    <form className="grid content-start gap-4" noValidate>
      <Card size="2" variant="classic" aria-labelledby="location-title">
        <Text id="location-title" size="2" weight="bold">
          Место происшествия
        </Text>

        <FormField
          label="Адрес (улица, дом, корпус, строение, владение, дорога, километр, метр, адресный участок, объект)"
          htmlFor="addressText"
        >
          <TextField.Root
            id="addressText"
            size="1"
            placeholder="Введите адрес"
            disabled={disabled}
            {...register("addressText")}
          />
        </FormField>

        <div className="incident-pair-grid mt-3 grid gap-2">
          <TextInput
            name="district"
            label="Район"
            placeholder="Введите район"
            register={register}
            disabled={disabled}
          />
          <TextInput
            name="objectType"
            label="Объект"
            placeholder="Введите объект"
            register={register}
            disabled={disabled}
          />
        </div>

        <div className="location-details-grid mt-3 grid gap-3">
          <TextInput
            name="entrance"
            label="Подъезд"
            placeholder="Введите подъезд"
            register={register}
            disabled={disabled}
          />
          <TextInput
            name="floor"
            label="Этаж"
            placeholder="Введите этаж"
            register={register}
            disabled={disabled}
          />
          <TextInput
            name="intercom"
            label="Домофон"
            placeholder="Введите домофон"
            register={register}
            disabled={disabled}
          />
          <TextInput
            name="latitude"
            label="Широта"
            placeholder="Введите широту"
            register={register}
            disabled={disabled}
          />
          <TextInput
            name="longitude"
            label="Долгота"
            placeholder="Введите долготу"
            register={register}
            disabled={disabled}
          />
          <Text as="label" size="1" color="gray" className="self-end pb-1">
            <Flex align="center" gap="1">
              <Controller
                control={control}
                name="nearby"
                render={({ field }) => (
                  <Checkbox
                    size="1"
                    checked={field.value}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                    disabled={disabled}
                  />
                )}
              />
              Рядом
            </Flex>
          </Text>
        </div>

        <FormField label="Доп. информация" htmlFor="placeNotes">
          <TextArea
            id="placeNotes"
            size="1"
            rows={2}
            placeholder="Напишите…"
            disabled={disabled}
            {...register("placeNotes")}
          />
        </FormField>
      </Card>

      <Card size="2" variant="classic" aria-labelledby="incident-title">
        <Text id="incident-title" size="2" weight="bold">
          О происшествии
        </Text>

        <FormField label="Тип происшествия" htmlFor="incidentType">
          <Controller
            control={control}
            name="incidentType"
            render={({ field }) => (
              <Select.Root
                size="1"
                value={field.value ?? ""}
                onValueChange={field.onChange}
                disabled={disabled}
              >
                <Select.Trigger
                  id="incidentType"
                  className="w-full"
                  placeholder="Выберите тип"
                />
                <Select.Content>
                  {INCIDENT_TYPE_OPTIONS.map((type) => (
                    <Select.Item key={type} value={type}>
                      {type}
                    </Select.Item>
                  ))}
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
            <Controller
              control={control}
              name="categories"
              render={({ field }) => (
                <Flex gap="1" mt="1" wrap="wrap">
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
                </Flex>
              )}
            />
          </div>
        </div>

        <div className="incident-counts-grid mt-3 grid gap-3">
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
        </div>

        <FormField label="Описание со слов заявителя" htmlFor="description">
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

type TextFieldName =
  | "district"
  | "objectType"
  | "entrance"
  | "floor"
  | "intercom"
  | "latitude"
  | "longitude";

function TextInput({
  name,
  label,
  placeholder,
  register,
  disabled,
}: {
  name: TextFieldName;
  label: string;
  placeholder: string;
  register: UseFormRegister<IncidentCardInput>;
  disabled: boolean;
}) {
  return (
    <FormField label={label} htmlFor={name}>
      <TextField.Root
        id={name}
        size="1"
        placeholder={placeholder}
        disabled={disabled}
        {...register(name)}
      />
    </FormField>
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
            value={field.value === "" ? undefined : Number(field.value)}
            onChange={field.onChange}
            onBlur={field.onBlur}
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
      color={active ? "red" : "gray"}
      variant="soft"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
