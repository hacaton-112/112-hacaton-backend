import { TextField } from "@bolid-ui/themes";

import { FieldLabel } from "./scenario-form-fields";
import { formatList, parseList } from "./scenario-form-values";

/** Keeps a trailing comma visible and commits the normalized list on blur. */
export function ListInput({
  label,
  items,
  onChange,
  hint = "через запятую",
  className,
}: {
  label: string;
  items: readonly string[];
  onChange: (items: string[]) => void;
  hint?: string;
  className?: string;
}) {
  const serialized = formatList(items);

  return (
    <FieldLabel label={label} hint={hint} className={className}>
      <TextField.Root
        key={serialized}
        size="2"
        defaultValue={serialized}
        onBlur={(event) => onChange(parseList(event.currentTarget.value))}
      />
    </FieldLabel>
  );
}
