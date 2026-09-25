import type { ReverseGeocodedAddress } from "../contracts/scenario-authoring";

// Типы места вызова живут в contracts; сервис только форматирует их.
export type { GeoPoint, IncidentLocationFill } from "../contracts/geo";

/** Шесть знаков — около десяти сантиметров: точнее клик по карте не бывает. */
export const formatCoordinate = (value: number): string => value.toFixed(6);

/**
 * Адрес одной строкой, как его просит поле карточки.
 *
 * Город, улица и дом идут через запятую; разбор занятия ищет каждую часть в
 * этой строке. Если провайдер разложить адрес не смог, берётся его полная
 * подпись — пустое поле хуже длинного.
 */
export const formatIncidentAddress = (
  address: Pick<
    ReverseGeocodedAddress,
    "city" | "street" | "house" | "displayName"
  >,
): string => {
  const parts = [address.city, address.street, address.house]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : address.displayName;
};
