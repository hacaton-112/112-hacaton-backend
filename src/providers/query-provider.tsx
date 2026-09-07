import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const queryProvider = (component: React.ReactNode) => {
  const queryClient = new QueryClient();

  return (
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
  );
};
