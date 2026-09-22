import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from './lib/queryClient'
import { router } from './routes'
import { getStoredLanguage } from './i18n'
import LanguageGateScreen from './screens/LanguageGateScreen'
import { supabaseConfigured } from './lib/supabase'
import { appRunsHere } from './lib/surface'

export default function App() {
  // Asked once per device, before the app opens — but only where the app
  // actually runs.
  //
  // The public website is a brochure. Stopping a visitor on "Choose your
  // language" before they have seen a single word about the product asks them
  // to make a decision about something they know nothing about yet, and it is
  // the first thing their eye lands on. The browser already states its
  // language; the site takes it and gets out of the way. The gate still runs
  // inside Telegram, where the next screen is the actual app.
  const [languageChosen, setLanguageChosen] = useState(
    () => !appRunsHere() || getStoredLanguage() !== null,
  )

  // Deliberately English-only and unstyled-plain: this is an operator error
  // (env vars missing from the build), not a user-facing state — without it a
  // misconfigured deploy renders a normal-looking app where every backend
  // call silently fails. That happened during this project: the app booted
  // fine against a placeholder client and nothing worked.
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
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
    </QueryClientProvider>
  )
}
