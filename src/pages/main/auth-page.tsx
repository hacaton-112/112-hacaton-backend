import { Flex, Heading, Text } from "@bolid-ui/themes";
import { Navigate } from "react-router";

import { AuthCornerDecoration } from "../../components/auth/auth-corner-decoration";
import { AuthForm } from "../../components/auth/auth-form";
import { useAuthStore } from "../../stores/auth.store";

export default function AuthPage() {
  const user = useAuthStore((state) => state.user);

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <Flex className="h-full min-h-0">
      {/* Промо-колонка не несёт функции ввода — на узких окнах скрываем её,
          и форма остаётся по центру страницы. */}
      <Flex
        direction="column"
        align="end"
        className="relative hidden flex-1 overflow-hidden px-10 md:flex lg:px-20"
      >
        <img
          src="/auth.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full object-contain object-center opacity-60 select-none"
        />
        <Flex
          direction="column"
          gap="4"
          className="rounded-4 relative z-10 max-w-2xl p-6"
        >
          <Heading size="7" weight="bold">
            Отработка приёма вызова
            <br />
            без риска для реальных заявителей
          </Heading>
          <Text size="3" color="gray" className="max-w-xl">
            Виртуальный заявитель отвечает голосом и меняет поведение в
            зависимости от ваших вопросов. После разговора система показывает
            пропущенные обязательные вопросы и критические ошибки.
          </Text>
        </Flex>
      </Flex>

      <Flex
        direction="column"
        justify="center"
        className="md:border-grayA-4 relative mx-auto w-full max-w-105 shrink-0 overflow-hidden px-10 md:mx-0 md:w-105 md:max-w-none md:border-l"
      >
        <AuthCornerDecoration />
        <Flex direction="column" gap="5" className="relative z-10 w-full">
          <Heading size="5">Авторизация</Heading>
          <AuthForm />
        </Flex>
      </Flex>
    </Flex>
  );
}
