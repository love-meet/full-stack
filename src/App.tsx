import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from './lib/queryClient'
import { router } from './routes'
import TelegramSuggestionBanner from './shell/TelegramSuggestionBanner'
import { getStoredLanguage } from './i18n'
import LanguageGateScreen from './screens/LanguageGateScreen'
import { supabaseConfigured } from './lib/supabase'

export default function App() {
  // Asked before anything else opens — including the landing page — on
  // first visit. Persists in localStorage so it only shows once per device.
  const [languageChosen, setLanguageChosen] = useState(() => getStoredLanguage() !== null)

  // Deliberately English-only and unstyled-plain: this is an operator error
  // (env vars missing from the build), not a user-facing state — without it
  // a misconfigured deploy renders a normal-looking app where every backend
  // call silently fails.
  if (!supabaseConfigured) {
    return (
      <div className="min-h-screen grid place-items-center px-8 text-center">
        <div className="glass rounded-2xl p-6 max-w-md">
          <p className="text-ink font-bold mb-2">App not configured</p>
          <p className="text-sm text-ink-2">
            VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY were not set when this
            build was created. Set them in the deploy environment and rebuild.
          </p>
        </div>
      </div>
    )
  }

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
