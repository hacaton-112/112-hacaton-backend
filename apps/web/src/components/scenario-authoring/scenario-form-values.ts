export const parseList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const formatList = (items: readonly string[]): string =>
  items.join(", ");
