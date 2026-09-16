import { Label, Text } from "@bolid-ui/themes";
import type { ReactNode } from "react";

/** Подпись над полем формы: у всех полей учебного центра одна раскладка. */
export function TrainingField({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Label className={`grid gap-1 ${className ?? ""}`}>
      <Text size="1" color="gray">
        {label}
      </Text>
      {children}
      {hint && (
        <Text size="1" color="red">
          {hint}
        </Text>
      )}
    </Label>
  );
}
