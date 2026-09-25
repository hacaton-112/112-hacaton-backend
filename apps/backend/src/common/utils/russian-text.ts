const ABBREVIATIONS: readonly [RegExp, string][] = [
  [/(?<!\p{L})д\.(?!\p{L})/giu, "дом"],
  [/(?<!\p{L})д(?!\p{L})/giu, "дом"],
  [/(?<!\p{L})корп\.(?!\p{L})/giu, "корпус"],
  [/(?<!\p{L})кв\.(?!\p{L})/giu, "квартира"],
  [/(?<!\p{L})под\.(?!\p{L})/giu, "подъезд"],
  [/(?<!\p{L})эт\.(?!\p{L})/giu, "этаж"],
  [/(?<!\p{L})ул\.(?!\p{L})/giu, "улица"],
  [/(?<!\p{L})ш\.(?!\p{L})/giu, "шоссе"],
  [/(?<!\p{L})обл\.(?!\p{L})/giu, "область"],
  [/(?<!\p{L})пр-т(?!\p{L})/giu, "проспект"],
];

/** Разворачивает только отдельные адресные сокращения, не меняя цифры. */
export const expandRussianAddressAbbreviations = (text: string): string =>
  ABBREVIATIONS.reduce(
    (expanded, [pattern, replacement]) =>
      expanded.replace(pattern, replacement),
    text,
  );
