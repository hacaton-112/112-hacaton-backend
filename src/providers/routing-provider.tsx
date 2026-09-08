import { HashRouter } from "react-router";

export const routingProvider = (component: React.ReactNode) => {
  return <HashRouter>{component}</HashRouter>;
};
