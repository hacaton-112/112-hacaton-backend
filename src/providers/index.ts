import { compose } from "../lib/utils";
import { errorBoundaryProvider } from "./error-boundary-provider";
import { queryProvider } from "./query-provider";
import { routingProvider } from "./routing-provider";
import { themeProvider } from "./theme-provider";

export const withProviders = compose(
  errorBoundaryProvider,
  themeProvider,
  routingProvider,
  queryProvider,
);
