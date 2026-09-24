import { Button, Dialog, Text, TextField } from "@bolid-ui/themes";
import { Check, LockKeyhole, Phone, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DISPATCH_SERVICE_LABELS,
  type DispatchService,
} from "../../contracts/incident";
import {
  dispatchServiceSelectionChanges,
  findDispatchServices,
  toggleDispatchServiceSelection,
} from "../../lib/dispatch-service-search";

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
  const [draft, setDraft] = useState<DispatchService[]>([]);
  const shown = useMemo(
    () => [
      ...classifierServices,
      ...services.filter((service) => !classifierServices.includes(service)),
    ],
    [classifierServices, services],
  );
  const directory = useMemo(() => findDispatchServices(query), [query]);
  const changes = useMemo(
    () => dispatchServiceSelectionChanges(services, draft, classifierServices),
    [classifierServices, draft, services],
  );

  const closePicker = () => {
    setPickerOpen(false);
    setQuery("");
  };

  const savePicker = () => {
    changes.forEach(onToggle);
    closePicker();
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
            if (open) setDraft(shown);
            else setQuery("");
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
              {directory.map((service) => {
                const selected = draft.includes(service);
                const locked = classifierServices.includes(service);

                return (
                  <button
                    key={service}
                    type="button"
                    role="listitem"
                    data-selected={selected || undefined}
                    aria-pressed={selected}
                    disabled={locked}
                    title={
                      locked
                        ? "Служба назначена классификатором и не снимается"
                        : undefined
                    }
                    onClick={() =>
                      setDraft((current) =>
                        toggleDispatchServiceSelection(
                          current,
                          service,
                          classifierServices,
                        ),
                      )
                    }
                  >
                    <Phone size={16} aria-hidden />
                    <span>
                      <strong>{DISPATCH_SERVICE_LABELS[service]}</strong>
                      <small>
                        {locked
                          ? "Назначена классификатором"
                          : selected
                            ? "Выбрана для карточки"
                            : "Не выбрана"}
                      </small>
                    </span>
                    {locked ? (
                      <LockKeyhole size={16} aria-hidden />
                    ) : selected ? (
                      <Check size={16} aria-hidden />
                    ) : (
                      <Plus size={16} aria-hidden />
                    )}
                  </button>
                );
              })}
              {directory.length === 0 && (
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

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Text size="2" color="gray">
                Выбрано: {draft.length}
              </Text>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="soft"
                  color="gray"
                  onClick={closePicker}
                >
                  Отмена
                </Button>
                <Button type="button" onClick={savePicker}>
                  Сохранить и закрыть
                </Button>
              </div>
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
