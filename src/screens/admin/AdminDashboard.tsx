import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAdminStats } from '../../hooks/useAdmin'
import { useAdsSwitch, useSetAdsEnabled, adsConfigured, adSettingsKey } from '../../hooks/useAds'
import { supabase } from '../../lib/supabase'

export default function AdminDashboard() {
  const stats = useAdminStats()

  const cards = [
    { label: 'Open reports',      to: '/admin/moderation',   key: 'open_reports',     accent: 'rose' },
    { label: 'Open tickets',      to: '/admin/support',      key: 'open_tickets',     accent: 'gold' },
    { label: 'Active bans',       to: '/admin/users',        key: 'active_bans',      accent: 'danger' },
    { label: 'Admins',            to: '/admin/users',        key: 'admin_count',      accent: 'magenta' },
    { label: 'Users',             to: '/admin/users',        key: 'user_count',       accent: 'success' },
  ] as const

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map((c) => {
          const value = stats.data ? (stats.data as Record<string, number>)[c.key] : null
          return (
            <Link
              key={c.label}
              to={c.to}
              className="glass rounded-2xl p-4 hover:bg-white/[0.04] transition-colors"
            >
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-bold">
                {c.label}
              </div>
              <div className={`mt-2 text-3xl font-extrabold text-${c.accent}`}>
                {value ?? '—'}
              </div>
            </Link>
          )
        })}
      </div>

      <AdsSwitch />
    </div>
  )
}

type AdsMeta = { updatedAt: string | null; updatedBy: string | null }

const adsMetaKey = ['app-settings', 'ads-meta'] as const

/** True when two query keys are the same tuple of values (not reference-equal arrays). */
function sameQueryKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/**
 * `updated_at` / `updated_by` from `app_settings`. Not exposed by
 * `useAds.ts` (it only carries the boolean everyone needs) — read directly
 * here, local to the one screen that shows it.
 */
function useAdsMeta() {
  return useQuery<AdsMeta>({
    queryKey: adsMetaKey,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('updated_at, updated_by')
        .eq('id', 1)
        .maybeSingle()
      if (error) throw error
      const row = data as { updated_at: string | null; updated_by: string | null } | null
      return { updatedAt: row?.updated_at ?? null, updatedBy: row?.updated_by ?? null }
    },
  })
}

/** Resolves the last editor's id to a display name. Best-effort: a missing name never blocks the switch. */
function useUpdaterName(userId: string | null) {
  return useQuery<string | null>({
    queryKey: ['profile-name', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, handle')
        .eq('id', userId as string)
        .maybeSingle()
      if (error) throw error
      const row = data as { display_name: string | null; handle: string | null } | null
      if (!row) return null
      return row.display_name ?? (row.handle ? `@${row.handle}` : null)
    },
  })
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString()
}

/**
 * The ad kill switch (§7).
 *
 * Ads run for everyone, always, independent of credits — this is the only
 * thing that turns them off, and it takes effect everywhere immediately
 * rather than waiting on a deploy. This reads the DATABASE value
 * (`useAdsSwitch`), not `useAdsVisible` — Victor must see and set the real
 * switch even while this build has no ad provider configured, so it is
 * already correct the moment AdSense approval lands.
 *
 * This does NOT mount the ads realtime subscription. Shell owns the app's
 * one mount of it; a second mount here would tear it down for
 * the whole app the moment this screen unmounts (realtime-js returns the
 * same channel object for a topic that is already open, and the first
 * unmount removes it for every caller). The value shown here comes from
 * the query cache that Shell's subscription already keeps live.
 *
 * Flipping this stops revenue for every user at once, so it goes through a
 * confirm step rather than a single tap, and the server's rejection (e.g.
 * a non-admin whose role check fails) is surfaced, never swallowed.
 */
function AdsSwitch() {
  const enabled = useAdsSwitch()
  const set = useSetAdsEnabled()
  const meta = useAdsMeta()
  const updater = useUpdaterName(meta.data?.updatedBy ?? null)
  const [confirming, setConfirming] = useState(false)
  const qc = useQueryClient()

  // Both this admin's own mutation (useSetAdsEnabled.onSuccess) AND Shell's
  // realtime subscription (useAdSettingsRealtime, in useAds.ts) write the
  // new value to the `adSettingsKey` query via `setQueryData` — never a
  // direct call we could hook into here, since Shell owns the app's one
  // realtime mount (D6) and useAds.ts is off-limits to edit.
  //
  // Reacting to `enabled` itself (the old approach) misses a same-value
  // write: `set_ads_enabled` (migration 0093) bumps `updated_at`/`updated_by`
  // unconditionally, even when a remote change sets `ads_enabled` to the
  // value it already had. `setQueryData` with an unchanged boolean does not
  // change what `enabled` resolves to, so an effect keyed on `enabled` never
  // fires — two admins who both see OFF and both confirm ON would leave the
  // second admin's dashboard crediting the first admin forever (until the
  // next window-focus refetch past the 30s staleTime).
  //
  // Subscribing to the QueryCache directly instead of to `enabled` sidesteps
  // that: every `setQueryData(adSettingsKey, …)` dispatches a `'success'`
  // action with a fresh `dataUpdatedAt`, regardless of whether the boolean
  // value actually changed, so this fires for every write — same-value or
  // not — and invalidating `adsMetaKey` here needs nothing from `useAds.ts`.
  useEffect(() => {
    return qc.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'success' &&
        sameQueryKey(event.query.queryKey, adSettingsKey)
      ) {
        qc.invalidateQueries({ queryKey: adsMetaKey })
      }
    })
  }, [qc])

  const target = !enabled
  const when = formatWhen(meta.data?.updatedAt ?? null)
  const lastChanged = when || updater.data
    ? `Last changed${when ? ` ${when}` : ''}${updater.data ? ` by ${updater.data}` : ''}.`
    : null

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">Ads</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {enabled
              ? adsConfigured
                ? 'Running for every user, on every surface.'
                : 'Switch is ON — ads will run as soon as a provider is configured.'
              : 'Off everywhere. No sponsored cards, no banners.'}
          </p>
          {!adsConfigured && (
            <p className="text-xs text-ink-muted mt-1">
              Ad provider is not configured in this build (VITE_AD_PROVIDER=none), so nothing renders
              regardless of this switch. The switch is still stored and takes effect the moment a
              provider is configured.
            </p>
          )}
          {lastChanged && <p className="text-[11px] text-ink-muted mt-1">{lastChanged}</p>}
        </div>
        <button
          onClick={() => setConfirming(true)}
          disabled={set.isPending}
          role="switch"
          aria-checked={enabled}
          aria-label="Ads enabled"
          className={[
            'relative w-14 h-8 rounded-full shrink-0 transition-colors disabled:opacity-60',
            enabled ? 'bg-gradient-brand glow-rose' : 'bg-white/15',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-1 w-6 h-6 rounded-full bg-white transition-transform',
              enabled ? 'translate-x-7' : 'translate-x-1',
            ].join(' ')}
          />
        </button>
      </div>

      {confirming && (
        <div className="mt-3 flex items-center flex-wrap gap-2 text-xs">
          <span className="text-ink-muted">
            {target
              ? 'Turn ads back on for every user?'
              : adsConfigured
                ? 'Turn ads off for every user, everywhere, right now? This stops revenue immediately.'
                : 'Turn ads off for every user, everywhere, right now? No provider is configured yet, so nothing is rendering today — this stops ads the moment one is.'}
          </span>
          <button
            onClick={() => {
              setConfirming(false)
              set.mutate(target)
            }}
            disabled={set.isPending}
            className="px-3 py-1 rounded-full bg-gradient-brand text-white font-bold disabled:opacity-60"
          >
            Confirm
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-3 py-1 rounded-full bg-white/10 text-ink font-bold"
          >
            Cancel
          </button>
        </div>
      )}

      {set.error && (
        <p className="mt-3 text-xs text-danger">{(set.error as Error).message}</p>
      )}
    </section>
  )
}
