import { Flex, Heading, Text } from "@bolid-ui/themes";
import { Navigate } from "react-router";

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
        justify="center"
        gap="4"
        className="hidden flex-1 px-10 md:flex lg:px-20"
      >
        <Heading size="7" weight="bold" className="max-w-2xl">
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

      <Flex
        direction="column"
        justify="center"
        gap="5"
        className="md:border-grayA-4 mx-auto w-full max-w-105 shrink-0 px-10 md:mx-0 md:w-105 md:max-w-none md:border-l"
      >
        <Heading size="5">Авторизация</Heading>
        <AuthForm />
      </Flex>
    </Flex>
  );
}
