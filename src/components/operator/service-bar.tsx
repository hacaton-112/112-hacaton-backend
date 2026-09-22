import { Popover } from "@bolid-ui/themes";
import { Phone, Plus, X } from "lucide-react";

import {
  DISPATCH_SERVICES,
  DISPATCH_SERVICE_LABELS,
  type DispatchService,
} from "../../contracts/incident";

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
  const shown = [
    ...classifierServices,
    ...services.filter((service) => !classifierServices.includes(service)),
  ];
  const rest = DISPATCH_SERVICES.filter((service) => !shown.includes(service));

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

      {rest.length > 0 && (
        <Popover.Root>
          <Popover.Trigger>
            <button
              type="button"
              className="arm112-service-add"
              aria-label="Добавить службу"
              disabled={disabled}
            >
              <Plus size={18} aria-hidden />
            </button>
          </Popover.Trigger>
          <Popover.Content size="1" className="arm112-service-menu">
            {rest.map((service) => (
              <button
                key={service}
                type="button"
                onClick={() => onToggle(service)}
              >
                {DISPATCH_SERVICE_LABELS[service]}
              </button>
            ))}
          </Popover.Content>
        </Popover.Root>
      )}

      {shown.length === 0 && (
        <span className="arm112-services-empty">Службы ещё не выбраны</span>
      )}
    </div>
  );
}
