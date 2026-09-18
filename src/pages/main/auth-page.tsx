import { Flex, Text } from "@bolid-ui/themes";
import { Navigate } from "react-router";

import { AuthForm } from "../../components/auth/auth-form";
import { ROUTES } from "../../config/routes";
import { useAuthStore } from "../../stores/auth.store";

export default function AuthPage() {
  const user = useAuthStore((state) => state.user);

  if (user) {
    return <Navigate to={ROUTES.operator()} replace />;
  }

  return (
    <Flex className="arm-login h-full min-h-0 overflow-hidden">
      <div className="arm-login-city" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="arm-login-illustration" aria-hidden="true">
        <img src="/auth.png" alt="" />
      </div>

      <main className="arm-login-panel">
        <div className="arm-login-brand" aria-label="Система 112">
          <strong>112</strong>
          <span>ВХОД В СИСТЕМУ</span>
        </div>

        <div className="arm-login-form">
          <AuthForm />
          <Text as="p" size="2" className="arm-login-support">
            Учебный контур Системы-112
            <br />
            Техническая поддержка: локальный администратор
          </Text>
        </div>
      </main>
    </Flex>
  );
}
