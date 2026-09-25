import { ErrorBoundary } from "../components/error-boundary";

export const errorBoundaryProvider = (component: React.ReactNode) => {
  return <ErrorBoundary>{component}</ErrorBoundary>;
};
