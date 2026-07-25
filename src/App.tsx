import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from './lib/queryClient'
import { router } from './routes'
import TelegramSuggestionBanner from './shell/TelegramSuggestionBanner'
import { getStoredLanguage } from './i18n'
import LanguageGateScreen from './screens/LanguageGateScreen'

export default function App() {
  // Asked before anything else opens — including the landing page — on
  // first visit. Persists in localStorage so it only shows once per device.
  const [languageChosen, setLanguageChosen] = useState(() => getStoredLanguage() !== null)

  if (!languageChosen) {
    return <LanguageGateScreen onDone={() => setLanguageChosen(true)} />
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TelegramSuggestionBanner />
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
    </QueryClientProvider>
  )
}
