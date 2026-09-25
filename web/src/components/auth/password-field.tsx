import { IconButton, TextField } from "@bolid-ui/themes";
import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";

type PasswordFieldProps = Omit<TextField.RootProps, "type">;

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const [isVisible, setIsVisible] = useState(false);
    const Icon = isVisible ? EyeOff : Eye;

    return (
      <TextField.Root
        {...props}
        ref={ref}
        type={isVisible ? "text" : "password"}
      >
        <TextField.Slot side="right">
          <IconButton
            type="button"
            size="1"
            variant="ghost"
            color="gray"
            // Toggling visibility must never submit the form or steal focus order.
            tabIndex={-1}
            aria-label={isVisible ? "Скрыть пароль" : "Показать пароль"}
            onClick={() => setIsVisible((visible) => !visible)}
          >
            <Icon size={16} aria-hidden />
          </IconButton>
        </TextField.Slot>
      </TextField.Root>
    );
  },
);
