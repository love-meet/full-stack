/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_AD_PROVIDER: string | undefined
  readonly VITE_ADSENSE_CLIENT: string | undefined
  readonly VITE_ADSENSE_SLOT_FEED: string | undefined
  readonly VITE_ADSENSE_SLOT_INLINE: string | undefined
  readonly VITE_ADSENSE_SLOT_SIDEBAR: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  /** Set once the AdSense library has finished loading successfully. */
  __lm_adsense?: boolean
  /** Set while the AdSense script tag is in flight, before load/error fires. */
  __lm_adsense_loading?: boolean
}
