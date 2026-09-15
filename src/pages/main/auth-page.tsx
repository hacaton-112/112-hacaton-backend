import { Flex, Heading, Text } from "@bolid-ui/themes";
import { Navigate } from "react-router";

import { AuthCornerDecoration } from "../../components/auth/auth-corner-decoration";
import { AuthForm } from "../../components/auth/auth-form";
import { useAuthStore } from "../../stores/auth.store";
import { ROUTES } from "../../config/routes";

export default function AuthPage() {
  const user = useAuthStore((state) => state.user);

  if (user) {
    return <Navigate to={ROUTES.operator()} replace />;
  }

  return (
    <Flex className="h-full min-h-0">
      {/* Промо-колонка не несёт функции ввода — на узких окнах скрываем её,
          и форма остаётся по центру страницы. */}
      {/*
       * Раскладка из login-redesign: текст сверху слева, иллюстрация прижата
       * к левому нижнему углу и заходит под описание. Картинка приглушена
       * только в светлой теме — на тёмном фоне полупрозрачность превращала
       * её в мутное серое пятно.
       */}
      <Flex
        direction="column"
        align="start"
        className="relative hidden flex-1 overflow-hidden px-10 pt-[12vh] md:flex lg:px-20"
      >
        <img
          src="/auth.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-[72%] w-[min(100%,1240px)] object-contain object-bottom-left opacity-60 select-none dark:opacity-100"
        />
        <Flex direction="column" gap="4" className="relative z-10 max-w-2xl">
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

      {/*
       * На узком окне колонка занимает всю ширину, а по центру ограничена
       * только форма: иначе декорация жила в блоке 420px посреди экрана и
       * обрывалась ровным краем вместо угла окна.
       */}
      <Flex
        direction="column"
        justify="center"
        className="md:border-grayA-4 relative w-full shrink-0 overflow-hidden px-10 md:w-105 md:border-l"
      >
        <AuthCornerDecoration />
        <Flex
          direction="column"
          gap="5"
          className="relative z-10 mx-auto w-full max-w-85"
        >
          <Heading size="5">Авторизация</Heading>
          <AuthForm />
        </Flex>
      </Flex>
    </Flex>
  );
}
