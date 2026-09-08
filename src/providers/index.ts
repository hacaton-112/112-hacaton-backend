import { compose } from "../lib/utils";
import { errorBoundaryProvider } from "./error-boundary-provider";
import { queryProvider } from "./query-provider";
import { routingProvider } from "./routing-provider";
import { themeProvider } from "./theme-provider";

/** The router is shared because both windows load the same React application. */
export const withRootProviders = compose(routingProvider);

/** Providers required only by the operator route branch. */
export const withAppProviders = compose(
  errorBoundaryProvider,
  themeProvider,
  queryProvider,
);

/** The map route branch only needs the Bolid theme. */
export const withMapWindowProviders = compose(themeProvider);
