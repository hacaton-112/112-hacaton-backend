import { Button, Callout, Flex, TextField } from "@bolid-ui/themes";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";
import { useForm } from "react-hook-form";

import {
  type AuthCredentials,
  AuthCredentialsSchema,
} from "../../contracts/auth";
import { useAuthLogin } from "../../hooks/use-auth";
import { FormField } from "./form-field";
import { PasswordField } from "./password-field";

export function AuthForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthCredentials>({
    resolver: zodResolver(AuthCredentialsSchema),
    defaultValues: { email: "", password: "" },
  });
  const { mutate, isPending, error } = useAuthLogin();

  return (
    <form
      onSubmit={handleSubmit((credentials) => mutate(credentials))}
      noValidate
    >
      <Flex direction="column" gap="3">
        {error && (
          <Callout.Root color="red" size="1" role="alert">
            <Callout.Icon>
              <CircleAlert size={16} aria-hidden />
            </Callout.Icon>
            <Callout.Text>{error.message}</Callout.Text>
          </Callout.Root>
        )}

        <FormField label="Логин" htmlFor="email" error={errors.email?.message}>
          <TextField.Root
            id="email"
            type="email"
            placeholder="Введите логин"
            autoComplete="username"
            autoFocus
            disabled={isPending}
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
        </FormField>

        <FormField
          label="Пароль"
          htmlFor="password"
          error={errors.password?.message}
        >
          <PasswordField
            id="password"
            placeholder="Введите пароль"
            autoComplete="current-password"
            disabled={isPending}
            aria-invalid={Boolean(errors.password)}
            {...register("password")}
          />
        </FormField>

        <Button type="submit" loading={isPending} mt="2">
          Войти
        </Button>
      </Flex>
    </form>
  );
}
