import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Optimistic UI is the norm here — short staleTime keeps refetches snappy
      // when the user comes back to a screen, but the cache still serves first.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
