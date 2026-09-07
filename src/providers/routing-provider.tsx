import { BrowserRouter } from "react-router";

export const routingProvider = (component: React.ReactNode) => {
  return <BrowserRouter>{component}</BrowserRouter>;
};
