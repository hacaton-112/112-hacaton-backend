import { Label, Text } from "@bolid-ui/themes";
import type { ReactNode } from "react";

/** Подпись над полем формы: у всех полей учебного центра одна раскладка. */
export function TrainingField({
  label,
  hint,
  reserveHintSpace = false,
  className,
  children,
}: {
  label: string;
  hint?: string;
  reserveHintSpace?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Label className={`grid min-w-0 gap-1 ${className ?? ""}`}>
      <Text size="1" color="gray">
        {label}
      </Text>
      {children}
      {(hint || reserveHintSpace) && (
        <span className="h-4 overflow-hidden" aria-live="polite">
          {hint && (
            <Text size="1" color="red" className="block truncate" title={hint}>
              {hint}
            </Text>
          )}
        </span>
      )}
    </Label>
  );
}
