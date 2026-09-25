import { twMerge } from "tailwind-merge";

type ClassValue = string | false | null | undefined;

/**
 * Склеивает tailwind-классы так, чтобы конфликтующие схлопывались.
 *
 * Без `twMerge` переданный компоненту `className` не мог переопределить
 * собственный класс компонента: в разметке оставались оба (`p-2 p-4`), а
 * выигрывал тот, что стоит позже в CSS, а не тот, что передали.
 */
export const cn = (...inputs: ClassValue[]) =>
  twMerge(inputs.filter(Boolean).join(" "));
