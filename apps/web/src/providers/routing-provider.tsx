import { BrowserRouter } from "react-router";

/**
 * Адреса разделов обычные, без `#`: клиент живёт в браузере, а gateway отдаёт
 * `index.html` на любой путь приложения. Хеш остался от десктопной сборки,
 * где своего сервера не было.
 */
export const routingProvider = (component: React.ReactNode) => {
  return <BrowserRouter>{component}</BrowserRouter>;
};
