import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

const queryClient = new QueryClient({
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

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <main className="boot-page">
        <h1>Mitsubachi Drive</h1>
        <p>フロントエンド基盤を初期化しました。</p>
      </main>
    ),
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
