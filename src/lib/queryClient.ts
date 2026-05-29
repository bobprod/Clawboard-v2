import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,        // 30s before refetch
      gcTime: 1000 * 60 * 5,       // 5min cache lifetime
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
