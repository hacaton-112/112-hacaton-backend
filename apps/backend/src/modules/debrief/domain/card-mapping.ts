import type { IncidentCard } from "@/modules/incident-card/dto/incident-card.dto";
import type {
  DispatchService,
  EmergencyService,
  IncidentCardField,
} from "@/drizzle/schema";

/**
 * Кнопки служб в окне оператора и службы, которых ждёт сценарий, — разные
 * словари. Оператор нажимает ДДС по номерам, как в настоящем АРМ, а сценарий
 * написан про пожарных, полицию, скорую и газовую службу. Перевод живёт здесь:
 * в карточке ему не место, иначе оператор и разбор заговорили бы на разных
 * языках.
 */
const SERVICE_BY_DISPATCH: Partial<Record<DispatchService, EmergencyService>> =
  {
    dds_01: "fire",
    dds_02: "police",
    dds_03: "ambulance",
    dds_04: "gas",
    rosgvardia: "police",
  };

/** Поля адреса, которые эталонная анкета проверяет независимо. */
export const ADDRESS_FIELDS: readonly IncidentCardField[] = [
  "city",
  "street",
  "house",
  "apartment",
  "entrance",
  "floor",
];

const joined = (
  ...values: readonly (string | null | undefined)[]
): string | null => {
  const present = values.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return present.length === 0 ? null : present.join(" ");
};

/** Что оператор написал в поле, которого ждёт эталонная анкета. */
export const cardValuesForReference = (
  card: IncidentCard | null,
): Readonly<Record<string, string | null>> => {
  if (card === null) {
    return {};
  }

  const address = card.addressText ?? null;
  const structuredHouse = joined(card.house, card.building, card.corpus);

  return {
    city: card.city ?? card.settlement ?? address,
    street: card.street ?? address,
    house: structuredHouse ?? address,
    apartment: card.apartment ?? address,
    entrance: joined(card.entrance, address),
    floor: joined(card.floor, address),
    object_type: card.objectType ?? null,
    landmarks: joined(card.intercom, card.placeNotes),
    caller_name: joined(
      card.callerLastName,
      card.callerFirstName,
      card.callerMiddleName,
    ),
    caller_phone: card.callerPhone ?? null,
    caller_type: joined(card.description, card.placeNotes),
    dispatcher_notes: card.description ?? null,
    category: joined(card.incidentType, card.categories.join(" ")),
    clarification: joined(card.incidentType, card.description),
    started_at: card.startedAt ?? null,
    victims_total:
      card.victimsTotal === null ? null : String(card.victimsTotal),
    children_count:
      card.victimsChildren === null ? null : String(card.victimsChildren),
    victims_condition: joined(card.description, card.placeNotes),
  };
};

/** Службы, которые оператор действительно назначил. */
export const dispatchedServices = (
  card: IncidentCard | null,
): readonly EmergencyService[] => {
  if (card === null) {
    return [];
  }

  const services = card.services
    .map((service) => SERVICE_BY_DISPATCH[service])
    .filter((service): service is EmergencyService => service !== undefined);

  return [...new Set(services)];
};
