import { Separator, Text } from "@bolid-ui/themes";
import {
  Building2,
  CarTaxiFront,
  Flame,
  HeartPulse,
  ShieldAlert,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { ScenarioSummary } from "../../contracts/call";
import { cn } from "../../lib/cn";
import {
  categoryAppearance,
  type CategoryTone,
  formatClock,
} from "./scenario-catalog-formatters";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  fire: Flame,
  road_accident: CarTaxiFront,
  medical: HeartPulse,
  criminal: ShieldAlert,
  gas_leak: Wind,
};

const MAX_DIFFICULTY = 5;

interface ScenarioCatalogCardProps {
  scenario: ScenarioSummary;
  selected: boolean;
  onSelect: () => void;
}

/** Карточка сценария в каталоге: выбор открывает брифинг справа. */
export function ScenarioCatalogCard({
  scenario,
  selected,
  onSelect,
}: ScenarioCatalogCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "grid w-full content-start gap-4 rounded-[16px] border-[1.5px] bg-(--color-panel-solid) p-6 text-left shadow-[0_6px_9px_rgba(0,0,0,0.03)] transition-[border-color,box-shadow] duration-(--app-transition-duration-fast)",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-8)",
        selected
          ? "border-(--orange-9) shadow-[0_8px_12px_rgba(0,0,0,0.04)]"
          : "border-transparent hover:border-(--gray-a6)",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <CodeChip code={scenario.code} />
        <CategoryChip category={scenario.category} />
      </div>

      <div className="grid min-w-0 gap-2">
        <Text as="p" size="4" weight="bold" className="leading-snug">
          {scenario.title}
        </Text>
        <Text
          as="p"
          size="2"
          color="gray"
          className="line-clamp-2 leading-[1.4]"
        >
          {scenario.summary}
        </Text>
      </div>

      <Separator size="4" />

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <Meta label="Сложность">
          <DifficultyDots
            level={scenario.difficulty}
            tone={categoryAppearance(scenario.category).tone}
          />
        </Meta>
        {scenario.expectedDurationSeconds !== undefined && (
          <Meta label="Длительность">
            {formatClock(scenario.expectedDurationSeconds)}
          </Meta>
        )}
        <Meta label="Норматив ответа">
          {formatClock(scenario.answerNormSeconds)}
        </Meta>
        <Meta label="Версия">{scenario.version}</Meta>
      </div>
    </button>
  );
}

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
      className="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-xs font-semibold"
      style={{
        backgroundColor: `var(--${tone}-a3)`,
        color: `var(--${tone}-11)`,
      }}
    >
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-[10px] tracking-[0.04em] text-(--gray-11) uppercase">
        {label}
      </span>
      <span className="text-[13px] font-medium text-(--gray-11) tabular-nums">
        {children}
      </span>
    </div>
  );
}

/** Пять точек, как на макете: закрашено столько, какова сложность. */
function DifficultyDots({
  level,
  tone,
}: {
  level: number;
  tone: CategoryTone;
}) {
  return (
    <span
      className="flex h-4 items-center gap-1"
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
