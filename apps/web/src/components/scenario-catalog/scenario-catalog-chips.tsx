import {
  Building2,
  CarTaxiFront,
  Flame,
  HeartPulse,
  ShieldAlert,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { categoryAppearance } from "./scenario-catalog-formatters";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  fire: Flame,
  road_accident: CarTaxiFront,
  medical: HeartPulse,
  criminal: ShieldAlert,
  gas_leak: Wind,
};

const MAX_DIFFICULTY = 5;

export function CodeChip({ code }: { code: string }) {
  return (
    <span className="rounded-[6px] bg-(--gray-a3) px-2.5 py-1 text-xs font-semibold text-(--gray-12) tabular-nums">
      {code}
    </span>
  );
}

export function CategoryChip({ category }: { category: string }) {
  const { label, tone } = categoryAppearance(category);
  const Icon = CATEGORY_ICONS[category] ?? Building2;

  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-semibold"
      style={{
        backgroundColor: `var(--${tone}-a3)`,
        color: `var(--${tone}-11)`,
      }}
      title={label}
    >
      <Icon size={12} className="shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Пять точек, как на макете: закрашено столько, какова сложность. */
export function DifficultyDots({ level }: { level: number }) {
  const tone = level <= 2 ? "green" : level === 3 ? "amber" : "red";

  return (
    <span
      className="flex items-center gap-1"
      role="img"
      aria-label={`Сложность ${level} из ${MAX_DIFFICULTY}`}
    >
      {Array.from({ length: MAX_DIFFICULTY }, (_, index) => (
        <span
          key={index}
          className="size-2 rounded-full"
          style={{
            backgroundColor:
              index < level ? `var(--${tone}-9)` : "var(--gray-a5)",
          }}
        />
      ))}
    </span>
  );
}
