/** Длиннее этого замечание перестаёт быть замечанием и становится текстом. */
const MAX_FRAGMENT_LENGTH = 120;

/**
 * Фрагмент для показа в списке замечаний.
 *
 * Замечание к набранному заглавными тексту относится ко всему полю, и без
 * обрезки разбор превращается в повторную печать описания происшествия.
 */
export function shortenFragment(
  fragment: string,
  limit = MAX_FRAGMENT_LENGTH,
): string {
  return fragment.length > limit
    ? `${fragment.slice(0, limit).trimEnd()}…`
    : fragment;
}
