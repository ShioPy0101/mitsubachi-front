import { QueryClient } from "@tanstack/react-query";

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof Error && "status" in error) {
            const status = Number(error.status);
            if ([400, 401, 403, 404, 413, 422].includes(status)) return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}
