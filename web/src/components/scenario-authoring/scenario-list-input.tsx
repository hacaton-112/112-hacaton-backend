import { TextField } from "@bolid-ui/themes";

import { useFieldError } from "./scenario-form-context";
import { FieldLabel, Loadable } from "./scenario-form-fields";
import { formatList, parseList } from "./scenario-form-values";

/** Keeps a trailing comma visible and commits the normalized list on blur. */
export function ListInput({
  label,
  path,
  items,
  onChange,
  hint = "через запятую",
  className,
}: {
  label: string;
  path?: string;
  items: readonly string[];
  onChange: (items: string[]) => void;
  hint?: string;
  className?: string;
}) {
  const serialized = formatList(items);
  const { error, clear } = useFieldError(path);

  return (
    <FieldLabel
      label={label}
      hint={hint}
      path={path}
      error={error}
      className={className}
    >
      <Loadable>
        <TextField.Root
          key={serialized}
          size="2"
          defaultValue={serialized}
          aria-invalid={error !== undefined}
          // Список сохраняется на blur, а ошибку снимает сама правка текста:
          // уход из поля без изменений не должен её прятать.
          onChange={clear}
          onBlur={(event) => onChange(parseList(event.currentTarget.value))}
        />
      </Loadable>
    </FieldLabel>
  );
}
