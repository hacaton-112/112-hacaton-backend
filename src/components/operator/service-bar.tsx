import { Button, Dialog, Text, TextField } from "@bolid-ui/themes";
import { Phone, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DISPATCH_SERVICE_LABELS,
  type DispatchService,
} from "../../contracts/incident";
import { findDispatchServices } from "../../lib/dispatch-service-search";

interface ServiceBarProps {
  /** Выбранные службы карточки: тот же список, что уходит на backend. */
  services: readonly DispatchService[];
  /** Назначены классификатором: такую вкладку закрыть нельзя. */
  classifierServices: readonly DispatchService[];
  disabled: boolean;
  onToggle: (service: DispatchService) => void;
}

/**
 * Полоса служб внизу карточки, как в реальном АРМ-112.
 *
 * Выбранная служба становится вкладкой с трубкой и крестиком, а «плюс»
 * открывает список остальных. Раньше службы лежали отдельной карточкой сбоку,
 * и оператор искал их глазами вместо того, чтобы читать строку слева направо.
 */
export function ServiceBar({
  services,
  classifierServices,
  disabled,
  onToggle,
}: ServiceBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => [
      ...classifierServices,
      ...services.filter((service) => !classifierServices.includes(service)),
    ],
    [classifierServices, services],
  );
  const rest = useMemo(
    () => findDispatchServices(query, shown),
    [query, shown],
  );

  const select = (service: DispatchService) => {
    onToggle(service);
    setPickerOpen(false);
    setQuery("");
  };

  return (
    <div className="arm112-services" data-tour="dispatch-services">
      <span className="arm112-services-label">Службы:</span>

      {shown.map((service) => {
        const required = classifierServices.includes(service);

        return (
          <span className="arm112-service-tab" key={service}>
            <Phone size={12} aria-hidden />
            <button
              type="button"
              className="arm112-service-close"
              aria-label={`Убрать ${DISPATCH_SERVICE_LABELS[service]}`}
              // Службу классификатора снять нельзя: её определил не оператор.
              disabled={disabled || required}
              title={
                required
                  ? "Служба назначена классификатором и не снимается"
                  : undefined
              }
              onClick={() => onToggle(service)}
            >
              <X size={12} aria-hidden />
            </button>
            <strong>{DISPATCH_SERVICE_LABELS[service]}</strong>
          </span>
        );
      })}

      {shown.length < Object.keys(DISPATCH_SERVICE_LABELS).length && (
        <Dialog.Root
          open={pickerOpen}
          onOpenChange={(open) => {
            setPickerOpen(open);
            if (!open) setQuery("");
          }}
        >
          <Dialog.Trigger>
            <button
              type="button"
              className="arm112-service-add"
              aria-label="Добавить службу"
              disabled={disabled}
            >
              <Plus size={18} aria-hidden />
            </button>
          </Dialog.Trigger>
          <Dialog.Content
            maxWidth="680px"
            className="w-[calc(100vw-2rem)] sm:max-w-[680px]"
          >
            <Dialog.Title>Добавьте службы</Dialog.Title>
            <Dialog.Description size="2" color="gray" mb="3">
              Найдите подразделение по названию или номеру службы. Выбранная
              служба появится в нижней полосе карточки.
            </Dialog.Description>

            <TextField.Root
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Поиск службы, например 103 или ЖКХ"
              aria-label="Поиск службы"
            >
              <TextField.Slot>
                <Search size={16} aria-hidden />
              </TextField.Slot>
            </TextField.Root>

            <div className="arm112-service-directory" role="list">
              {rest.map((service) => (
                <button
                  key={service}
                  type="button"
                  role="listitem"
                  onClick={() => select(service)}
                >
                  <Phone size={16} aria-hidden />
                  <span>
                    <strong>{DISPATCH_SERVICE_LABELS[service]}</strong>
                    <small>Добавить в карточку происшествия</small>
                  </span>
                  <Plus size={16} aria-hidden />
                </button>
              ))}
              {rest.length === 0 && (
                <Text
                  as="p"
                  size="2"
                  color="gray"
                  align="center"
                  className="py-5"
                >
                  Подходящих служб не найдено
                </Text>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <Dialog.Close>
                <Button type="button" variant="soft" color="gray">
                  Закрыть
                </Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Root>
      )}

      {shown.length === 0 && (
        <span className="arm112-services-empty">Службы ещё не выбраны</span>
      )}
    </div>
  );
}
