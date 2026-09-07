import {
  Button,
  Card,
  CheckboxGroup,
  Flex,
  Heading,
  SegmentedControl,
  Select,
  Switch,
  Text,
  TextArea,
  TextField,
} from "@bolid-ui/themes";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useEffect } from "react";

import {
  CALLER_ROLE_LABELS,
  EMERGENCY_SERVICE_LABELS,
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_PRIORITY_LABELS,
  type IncidentCard,
  type IncidentCardInput,
  IncidentCardSchema,
} from "../../contracts/incident";
import { FormField } from "../auth/form-field";

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
  services: [],
  priority: "normal",
  description: "",
};

interface IncidentFormProps {
  /** Адрес, определённый по вызову: подставляется в поле, но остаётся редактируемым. */
  resolvedAddress?: string;
  callerPhone?: string;
  disabled?: boolean;
  onSubmit?: (card: IncidentCard) => void;
}

export function IncidentForm({
  resolvedAddress,
  callerPhone,
  disabled = false,
  onSubmit,
}: IncidentFormProps) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitSuccessful },
  } = useForm<IncidentCardInput, unknown, IncidentCard>({
    resolver: zodResolver(IncidentCardSchema),
    defaultValues: EMPTY_CARD,
  });

  // Данные вызова приходят асинхронно — подставляем их по мере определения.
  useEffect(() => {
    if (resolvedAddress) setValue("address", resolvedAddress);
  }, [resolvedAddress, setValue]);

  useEffect(() => {
    if (callerPhone) setValue("callerPhone", callerPhone);
  }, [callerPhone, setValue]);

  return (
    <Card size="2" className="h-full">
      <form onSubmit={handleSubmit((card) => onSubmit?.(card))} noValidate>
        <Flex direction="column" gap="3">
          <Flex align="center" justify="between">
            <Heading size="3">Карточка происшествия</Heading>
            {isSubmitSuccessful && (
              <Text size="1" color="green">
                Сохранено
              </Text>
            )}
          </Flex>

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
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <Select.Trigger id="category" />
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

          <FormField
            label="Адрес"
            htmlFor="address"
            error={errors.address?.message}
          >
            <TextField.Root
              id="address"
              placeholder="Улица, дом, строение"
              disabled={disabled}
              {...register("address")}
            />
          </FormField>

          <Flex gap="3">
            <FormField
              label="Кв. / подъезд"
              htmlFor="apartment"
              error={errors.apartment?.message}
            >
              <TextField.Root
                id="apartment"
                disabled={disabled}
                {...register("apartment")}
              />
            </FormField>
            <FormField
              label="Пострадавших"
              htmlFor="victimsCount"
              error={errors.victimsCount?.message}
            >
              <TextField.Root
                id="victimsCount"
                type="number"
                min={0}
                disabled={disabled}
                {...register("victimsCount")}
              />
            </FormField>
          </Flex>

          <FormField
            label="Ориентир"
            htmlFor="landmark"
            error={errors.landmark?.message}
          >
            <TextField.Root
              id="landmark"
              placeholder="Как найти: вход со двора, рядом школа…"
              disabled={disabled}
              {...register("landmark")}
            />
          </FormField>

          <Flex gap="3">
            <FormField
              label="Заявитель"
              htmlFor="callerName"
              error={errors.callerName?.message}
            >
              <TextField.Root
                id="callerName"
                disabled={disabled}
                {...register("callerName")}
              />
            </FormField>
            <FormField
              label="Телефон"
              htmlFor="callerPhone"
              error={errors.callerPhone?.message}
            >
              <TextField.Root
                id="callerPhone"
                disabled={disabled}
                {...register("callerPhone")}
              />
            </FormField>
          </Flex>

          <FormField
            label="Кто звонит"
            htmlFor="callerRole"
            error={errors.callerRole?.message}
          >
            <Controller
              control={control}
              name="callerRole"
              render={({ field }) => (
                <SegmentedControl.Root
                  value={field.value}
                  onValueChange={field.onChange}
                  size="1"
                  disabled={disabled}
                >
                  {Object.entries(CALLER_ROLE_LABELS).map(([value, label]) => (
                    <SegmentedControl.Item key={value} value={value}>
                      {label}
                    </SegmentedControl.Item>
                  ))}
                </SegmentedControl.Root>
              )}
            />
          </FormField>

          <FormField
            label="Привлекаемые службы"
            htmlFor="services"
            error={errors.services?.message}
          >
            <Controller
              control={control}
              name="services"
              render={({ field }) => (
                <CheckboxGroup.Root
                  value={field.value}
                  onValueChange={field.onChange}
                  size="1"
                  disabled={disabled}
                >
                  <Flex wrap="wrap" gapX="4" gapY="1">
                    {Object.entries(EMERGENCY_SERVICE_LABELS).map(
                      ([value, label]) => (
                        <CheckboxGroup.Item key={value} value={value}>
                          {label}
                        </CheckboxGroup.Item>
                      ),
                    )}
                  </Flex>
                </CheckboxGroup.Root>
              )}
            />
          </FormField>

          <Flex align="center" justify="between" gap="3">
            <FormField
              label="Приоритет"
              htmlFor="priority"
              error={errors.priority?.message}
            >
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <SegmentedControl.Root
                    value={field.value}
                    onValueChange={field.onChange}
                    size="1"
                    disabled={disabled}
                  >
                    {Object.entries(INCIDENT_PRIORITY_LABELS).map(
                      ([value, label]) => (
                        <SegmentedControl.Item key={value} value={value}>
                          {label}
                        </SegmentedControl.Item>
                      ),
                    )}
                  </SegmentedControl.Root>
                )}
              />
            </FormField>

            <Controller
              control={control}
              name="threatToLife"
              render={({ field }) => (
                <Text as="label" size="2">
                  <Flex align="center" gap="2">
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      color="red"
                      disabled={disabled}
                    />
                    Угроза жизни
                  </Flex>
                </Text>
              )}
            />
          </Flex>

          <FormField
            label="Описание"
            htmlFor="description"
            error={errors.description?.message}
          >
            <TextArea
              id="description"
              rows={4}
              placeholder="Что произошло со слов заявителя"
              disabled={disabled}
              {...register("description")}
            />
          </FormField>

          <Flex gap="2" justify="end">
            <Button
              type="button"
              size="2"
              variant="soft"
              color="gray"
              disabled={disabled}
              onClick={() => reset(EMPTY_CARD)}
            >
              Очистить
            </Button>
            <Button type="submit" size="2" disabled={disabled}>
              Передать в службы
            </Button>
          </Flex>
        </Flex>
      </form>
    </Card>
  );
}
